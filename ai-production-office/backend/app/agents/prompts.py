"""Hər agentin tapşırıq üçün aldığı konteksti qurur. Bütün iş Azərbaycan dilində aparılır."""
from __future__ import annotations

from sqlalchemy import select

from ..db import Employee, MemoryNote, Message, Project, Task, session

STUDIO_NAME = "İLHAM Studio"
PRIORITY_AZ = {"low": "aşağı", "medium": "orta", "high": "yüksək", "critical": "kritik"}
STATUS_AZ = {"pending": "gözləmədə", "queued": "növbədə", "running": "icrada", "completed": "tamamlandı",
             "failed": "uğursuz", "cancelled": "ləğv edildi"}

OPERATING_RULES = f"""
# {STUDIO_NAME}-da necə işləyirsən
- Sən çox-agentli prodüksiya studiyasında işçisən. Komanda yoldaşların digər süni intellekt agentləridir,
  studiyanın sahibi isə insandır.
- DİL: Bütün nəticələri, mesajları, qeydləri, artefakt başlıqlarını və hesabatları YALNIZ Azərbaycan dilində
  yaz (latın əlifbası, düzgün ə, ı, ö, ü, ğ, ş, ç hərfləri ilə). Brend adları və texniki terminlər istisnadır.
- Real iş gör. Alətin həqiqətən etmədiyi heç nəyi (çəkiliş, montaj, araşdırma, render) etdiyini iddia etmə.
  İmkan yoxdursa, bunu açıq de və ən yaxşı planı təqdim et.
- Faydalı olduqda alətlərdən istifadə et: yoldaşlarının işi üçün read_deliverable, qısa canlı sual üçün
  consult_colleague, qeyd ötürmək üçün send_message, interfeysdə göstərilən strukturlaşdırılmış nəticələr
  (cədvəllər, palitralar) üçün save_artifact.
- İşi bitirəndə submit_deliverable alətini yalnız bir dəfə çağır: tam nəticə Markdown formatında və bir
  cümləlik xülasə ilə.
""".strip()


def employee_directory() -> str:
    with session() as s:
        rows = s.scalars(select(Employee).where(Employee.active.is_(True)).order_by(Employee.desk)).all()
        return "\n".join(f"- {e.key}: {e.name}, {e.title} — {e.job_description}" for e in rows)


def system_prompt(emp: Employee) -> str:
    return f"{emp.system_prompt}\n\n# İş təsvirin\n{emp.job_description}\n\n{OPERATING_RULES}\n\n" \
           f"# Həmkarların (açar: ad, vəzifə)\n{employee_directory()}"


def task_brief(task_id: int, employee_id: int) -> str:
    with session() as s:
        t = s.get(Task, task_id)
        p = s.get(Project, t.project_id)
        emps = {e.id: e for e in s.scalars(select(Employee))}
        parts = [f"# Layihə: {p.title}\n{p.description}"]
        if p.plan_summary:
            parts.append(f"## Direktorun planı\n{p.plan_summary}")
        if p.owner_feedback and t.kind == "delivery":
            parts.append(f"## Sahibin əvvəlki paketə rəyi (mütləq nəzərə alınmalıdır)\n{p.owner_feedback}")
        parts.append(f"# Sənin tapşırığın (id {t.id}, prioritet: {PRIORITY_AZ.get(t.priority, t.priority)})\n"
                     f"**{t.title}**\n\n{t.description}")
        if t.feedback:
            parts.append(f"## REVİZİYA TƏLƏB OLUNUR (raund {t.revision_count})\n{t.feedback}")
            if t.deliverable:
                parts.append(f"## Əvvəlki versiyan\n{t.deliverable}")

        all_tasks = s.scalars(select(Task).where(Task.project_id == p.id).order_by(Task.id)).all()
        if t.kind == "delivery":
            scope = [x for x in all_tasks if x.id != t.id and x.deliverable and x.status == "completed"]
        else:
            scope = [x for x in all_tasks if x.id in (t.depends_on or []) and x.deliverable]
        if scope:
            label = "Yoxlanılacaq nəticələr" if t.kind == "review" else "Komanda yoldaşlarından gələn materiallar"
            parts.append(f"# {label}")
            for x in scope:
                who = emps[x.assignee_id] if x.assignee_id in emps else None
                parts.append(f"## Tapşırıq {x.id}: {x.title} — {who.name + ', ' + who.title if who else 'təyin edilməyib'}"
                             f" (revizyalar: {x.revision_count})\n{x.deliverable}")
        if t.kind == "delivery":
            parts.append("# İştirakçıların göstəriciləri (icra qeydlərindən)")
            for e in emps.values():
                mine = [x for x in all_tasks if x.assignee_id == e.id and x.id != t.id]
                if mine:
                    cost = sum(x.cost_usd for x in mine)
                    revs = sum(x.revision_count for x in mine)
                    parts.append(f"- {e.name} ({e.title}): {len(mine)} tapşırıq, {revs} revizya, ${cost:.4f}")

        parts.append("# Layihənin tapşırıq siyahısı\n" + "\n".join(
            f"- [{x.id}] {x.title} → {emps[x.assignee_id].title if x.assignee_id in emps else '-'} "
            f"({STATUS_AZ.get(x.status, x.status)})" for x in all_tasks))
        inbox = s.scalars(select(Message).where(Message.to_id == employee_id, Message.read.is_(False))
                          .order_by(Message.id)).all()
        if inbox:
            parts.append("# Oxunmamış mesajlar\n" + "\n".join(
                f"- {emps[m.from_id].name if m.from_id in emps else 'Sahib'} ({m.kind}): {m.content}" for m in inbox))
            for m in inbox:
                m.read = True
            s.commit()
        notes = s.scalars(select(MemoryNote).where(MemoryNote.project_id == p.id,
                                                   MemoryNote.employee_id == employee_id)).all()
        if notes:
            parts.append("# İş yaddaşın\n" + "\n".join(f"- {n.key}: {n.value}" for n in notes))
        if t.kind == "review":
            parts.append("Yuxarıdakı hər nəticəni yoxla. Hər tapşırıq id-si üçün approve_task və ya request_revision "
                         "çağır, sonra submit_deliverable ilə QC hesabatını təqdim et. Hər şey Azərbaycan dilində olsun.")
        return "\n\n".join(parts)
