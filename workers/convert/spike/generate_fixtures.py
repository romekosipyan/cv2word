"""Generate synthetic, rights-cleared resume PDFs for the US-070 spike.

Identities are obviously fake (example.test, 555 numbers). No real personal data.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures"
FILES = FIXTURES / "files"

LETTER = fitz.paper_rect("letter")
A4 = fitz.paper_rect("a4")

WINDOWS_FONTS = {
    "arial": Path(r"C:\Windows\Fonts\arial.ttf"),
    "arialbd": Path(r"C:\Windows\Fonts\arialbd.ttf"),
    "times": Path(r"C:\Windows\Fonts\times.ttf"),
    "timesbd": Path(r"C:\Windows\Fonts\timesbd.ttf"),
    "calibri": Path(r"C:\Windows\Fonts\calibri.ttf"),
    "calibrib": Path(r"C:\Windows\Fonts\calibrib.ttf"),
    "georgia": Path(r"C:\Windows\Fonts\georgia.ttf"),
    "georgiab": Path(r"C:\Windows\Fonts\georgiab.ttf"),
    "segoe": Path(r"C:\Windows\Fonts\segoeui.ttf"),
    "segoeb": Path(r"C:\Windows\Fonts\segoeuib.ttf"),
    "consolas": Path(r"C:\Windows\Fonts\consola.ttf"),
}

FONT_PAIRS = [
    ("arial", "arialbd"),
    ("times", "timesbd"),
    ("calibri", "calibrib"),
    ("georgia", "georgiab"),
    ("segoe", "segoeb"),
]

EMPLOYERS = [
    ("Example Labs", "June 2023 – Present", "Staff Product Designer"),
    ("Sample Corp", "June 2019 – May 2023", "UX Designer"),
    ("Fixture Works", "January 2017 – May 2019", "Visual Designer"),
    ("Placeholder Inc", "August 2015 – December 2016", "Design Intern"),
    ("Mock Industries", "March 2021 – Present", "Engineering Manager"),
    ("Synthetic Systems", "April 2018 – February 2021", "Backend Engineer"),
    ("Demo Studio", "September 2016 – March 2018", "Frontend Engineer"),
    ("Testfoundry", "May 2014 – August 2016", "QA Analyst"),
]

PEOPLE = [
    ("Ada Example", "ada@example.test", "+1-555-0100"),
    ("Blake Sample", "blake@example.test", "+1-555-0101"),
    ("Casey Fixture", "casey@example.test", "+1-555-0102"),
    ("Drew Placeholder", "drew@example.test", "+1-555-0103"),
    ("Eden Mock", "eden@example.test", "+1-555-0104"),
    ("Finley Synthetic", "finley@example.test", "+1-555-0105"),
    ("Gray Demo", "gray@example.test", "+1-555-0106"),
    ("Harper Testuser", "harper@example.test", "+1-555-0107"),
    ("Indigo Dummy", "indigo@example.test", "+1-555-0108"),
    ("Jules Fictional", "jules@example.test", "+1-555-0109"),
    ("Kai Prototype", "kai@example.test", "+1-555-0110"),
    ("Logan Standin", "logan@example.test", "+1-555-0111"),
    ("Morgan Placeholder", "morgan@example.test", "+1-555-0112"),
    ("Nico Exampleton", "nico@example.test", "+1-555-0113"),
    ("Oakley Sampleman", "oakley@example.test", "+1-555-0114"),
    ("Parker Faketown", "parker@example.test", "+1-555-0115"),
    ("Quinn Mockwell", "quinn@example.test", "+1-555-0116"),
    ("Reese Testdata", "reese@example.test", "+1-555-0117"),
    ("Sage Dummyworth", "sage@example.test", "+1-555-0118"),
    ("Taylor Fictious", "taylor@example.test", "+1-555-0119"),
    ("Uma Exampleberg", "uma@example.test", "+1-555-0120"),
    ("Val Fixtureton", "val@example.test", "+1-555-0121"),
    ("Wren Sampled", "wren@example.test", "+1-555-0122"),
    ("Xander Placeholder", "xander@example.test", "+1-555-0123"),
    ("Yael Mockridge", "yael@example.test", "+1-555-0124"),
    ("Zion Testfield", "zion@example.test", "+1-555-0125"),
    ("José Ejemplo", "jose@example.test", "+1-555-0126"),
    ("François Exemple", "francois@example.test", "+1-555-0127"),
    ("Müller Beispiel", "muller@example.test", "+1-555-0128"),
    ("Søren Prøve", "soren@example.test", "+1-555-0129"),
]


def resolve_font(key: str) -> tuple[str, str | None]:
    path = WINDOWS_FONTS.get(key)
    if path and path.exists():
        return key, str(path)
    builtin = {"arial": "helv", "arialbd": "hebo", "times": "tiro", "timesbd": "tibo"}.get(key, "helv")
    return builtin, None


def register_fonts(page: fitz.Page, body_key: str, bold_key: str) -> tuple[str, str]:
    body_name, body_path = resolve_font(body_key)
    bold_name, bold_path = resolve_font(bold_key)
    if body_path:
        page.insert_font(fontname=body_name, fontfile=body_path)
    if bold_path:
        page.insert_font(fontname=bold_name, fontfile=bold_path)
    return body_name, bold_name


def write_box(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    fontname: str,
    size: float = 11,
    color: tuple[float, float, float] = (0, 0, 0),
    align: int = fitz.TEXT_ALIGN_LEFT,
) -> None:
    page.insert_textbox(rect, text, fontsize=size, fontname=fontname, color=color, align=align)


def new_doc(page_size: str) -> fitz.Document:
    doc = fitz.open()
    rect = A4 if page_size == "a4" else LETTER
    doc.new_page(width=rect.width, height=rect.height)
    return doc


def add_page(doc: fitz.Document, page_size: str) -> fitz.Page:
    rect = A4 if page_size == "a4" else LETTER
    return doc.new_page(width=rect.width, height=rect.height)


def page_size_for(index: int) -> str:
    return "a4" if index % 2 else "letter"


def jobs_for(index: int, count: int) -> list[tuple[str, str, str]]:
    start = index % len(EMPLOYERS)
    return [EMPLOYERS[(start + i) % len(EMPLOYERS)] for i in range(count)]


def extra_roles(name: str) -> list[str]:
    first = name.split()[0]
    return [
        f"Led the {first} conversion checklist for synthetic onboarding at Example Labs.",
        f"Wrote internal style notes so reviewers could edit role descriptions after export.",
        "Coordinated cross-team reviews without changing facts on the source resume.",
        "Documented spacing limits for one to five page Letter and A4 exports.",
    ]


def summary_for(name: str, role: str) -> str:
    return (
        f"{name} is a fictional {role.lower()} used only for converter tests. "
        "This fixture contains no real personal data. Work samples describe synthetic products "
        "such as the Example Labs onboarding kit and the Sample Corp design system."
    )


def skills_line() -> str:
    return "Python · SQL · Figma · Accessibility · Documentation"


def education_line() -> str:
    return "B.A. Design, Example University, 2015"


def render_simple(profile: dict) -> fitz.Document:
    page_size = profile["page_size"]
    pages_wanted = profile["pages"]
    body_key, bold_key = FONT_PAIRS[profile["font_index"] % len(FONT_PAIRS)]
    doc = new_doc(page_size)
    page = doc[0]
    body, bold = register_fonts(page, body_key, bold_key)
    width, height = page.rect.width, page.rect.height
    margin = 56
    y = 52
    name = profile["name"]
    email = profile["email"]
    phone = profile["phone"]
    jobs = profile["jobs"]
    headline = jobs[0][2]
    link = profile.get("link")
    ligatures = profile.get("ligatures", False)

    header = name
    write_box(page, fitz.Rect(margin, y, width - margin, y + 28), header, bold, 20)
    y += 30
    write_box(page, fitz.Rect(margin, y, width - margin, y + 18), headline, body, 12, (0.15, 0.15, 0.15))
    y += 20
    contact = f"{email}  ·  {phone}"
    if link:
        contact += f"  ·  {link}"
    write_box(page, fitz.Rect(margin, y, width - margin, y + 16), contact, body, 10, (0.1, 0.1, 0.45))
    if link:
        page.insert_link(
            {
                "kind": fitz.LINK_URI,
                "from": fitz.Rect(margin, y, width - margin, y + 16),
                "uri": link,
            }
        )
    y += 22
    page.draw_line(fitz.Point(margin, y), fitz.Point(width - margin, y), color=(0.2, 0.2, 0.2), width=0.6)
    y += 14

    write_box(page, fitz.Rect(margin, y, width - margin, y + 16), "Summary", bold, 13)
    y += 18
    summary = summary_for(name, headline)
    if ligatures:
        summary += " Experience includes office affiliation work and a difficult onboarding ﬂow."
        summary = summary.replace("office", "ofﬁce").replace("affiliation", "afﬁliation")
    write_box(page, fitz.Rect(margin, y, width - margin, y + 54), summary, body, 10.5)
    y += 60

    write_box(page, fitz.Rect(margin, y, width - margin, y + 16), "Experience", bold, 13)
    y += 20

    bullets = extra_roles(name)
    job_iter = list(jobs)
    page_index = 0
    for employer, dates, title in job_iter:
        block_h = 72
        if y + block_h > height - 56:
            if page_index + 1 >= pages_wanted:
                break
            page = add_page(doc, page_size)
            body, bold = register_fonts(page, body_key, bold_key)
            y = 56
            page_index += 1
        write_box(page, fitz.Rect(margin, y, width - margin - 160, y + 16), f"{title}, {employer}", bold, 11)
        write_box(page, fitz.Rect(width - margin - 150, y, width - margin, y + 16), dates, body, 10, (0.2, 0.2, 0.2))
        y += 18
        role_text = f"• {bullets[0]}\n• {bullets[1]}"
        write_box(page, fitz.Rect(margin, y, width - margin, y + 40), role_text, body, 10.5)
        y += 46

    if y + 70 < height - 48:
        write_box(page, fitz.Rect(margin, y, width - margin, y + 16), "Skills", bold, 13)
        y += 18
        write_box(page, fitz.Rect(margin, y, width - margin, y + 16), skills_line(), body, 10.5)
        y += 24
        write_box(page, fitz.Rect(margin, y, width - margin, y + 16), "Education", bold, 13)
        y += 18
        write_box(page, fitz.Rect(margin, y, width - margin, y + 16), education_line(), body, 10.5)
    else:
        page = add_page(doc, page_size)
        body, bold = register_fonts(page, body_key, bold_key)
        y = 56
        write_box(page, fitz.Rect(margin, y, width - margin, y + 16), "Skills", bold, 13)
        y += 18
        write_box(page, fitz.Rect(margin, y, width - margin, y + 16), skills_line(), body, 10.5)
        y += 24
        write_box(page, fitz.Rect(margin, y, width - margin, y + 16), "Education", bold, 13)
        y += 18
        write_box(page, fitz.Rect(margin, y, width - margin, y + 16), education_line(), body, 10.5)

    while len(doc) < pages_wanted:
        page = add_page(doc, page_size)
        body, bold = register_fonts(page, body_key, bold_key)
        y = 56
        write_box(page, fitz.Rect(margin, y, width - margin, y + 16), "Additional experience", bold, 13)
        y += 20
        extra_job = EMPLOYERS[(profile["index"] + 3) % len(EMPLOYERS)]
        write_box(
            page,
            fitz.Rect(margin, y, width - margin, y + 16),
            f"{extra_job[2]}, {extra_job[0]}  ·  {extra_job[1]}",
            bold,
            11,
        )
        y += 20
        write_box(
            page,
            fitz.Rect(margin, y, width - margin, y + 80),
            "• Extended the synthetic corpus with extra pages for pagination checks.\n"
            "• Kept facts stable across Letter and A4 variants.\n"
            "• Reviewed heading and bullet boundaries after export.",
            body,
            10.5,
        )
        profile["jobs"] = list(profile["jobs"]) + [extra_job]

    return doc


def render_two_column(profile: dict) -> fitz.Document:
    page_size = profile["page_size"]
    body_key, bold_key = FONT_PAIRS[profile["font_index"] % len(FONT_PAIRS)]
    doc = new_doc(page_size)
    page = doc[0]
    body, bold = register_fonts(page, body_key, bold_key)
    width, height = page.rect.width, page.rect.height
    left = 40
    gutter = 16
    left_w = 168
    right_x = left + left_w + gutter
    right_w = width - right_x - 40

    page.draw_rect(fitz.Rect(0, 0, left + left_w + 8, height), color=(0.93, 0.94, 0.96), fill=(0.93, 0.94, 0.96))
    page.draw_line(
        fitz.Point(left + left_w + 8, 36),
        fitz.Point(left + left_w + 8, height - 36),
        color=(0.55, 0.58, 0.62),
        width=0.8,
    )

    name = profile["name"]
    email = profile["email"]
    phone = profile["phone"]
    jobs = profile["jobs"]
    headline = jobs[0][2]
    left_only = profile["left_only"]
    right_only = profile["right_only"]

    write_box(page, fitz.Rect(left, 40, left + left_w, 78), name, bold, 14)
    write_box(page, fitz.Rect(left, 80, left + left_w, 100), headline, body, 9)
    write_box(page, fitz.Rect(left, 108, left + left_w, 124), "Contact", bold, 11)
    write_box(page, fitz.Rect(left, 126, left + left_w, 190), f"{email}\n{phone}\n{left_only[0]}", body, 9)
    write_box(page, fitz.Rect(left, 200, left + left_w, 216), "Skills", bold, 11)
    write_box(page, fitz.Rect(left, 218, left + left_w, 300), f"{skills_line()}\n{left_only[1]}", body, 9)
    write_box(page, fitz.Rect(left, 310, left + left_w, 326), "Education", bold, 11)
    write_box(page, fitz.Rect(left, 328, left + left_w, 400), f"{education_line()}\n{left_only[2]}", body, 9)

    write_box(page, fitz.Rect(right_x, 40, right_x + right_w, 62), "Experience", bold, 14)
    y = 70
    for i, (employer, dates, title) in enumerate(jobs):
        marker = right_only[i] if i < len(right_only) else employer
        write_box(page, fitz.Rect(right_x, y, right_x + right_w, y + 16), f"{title}, {employer}", bold, 11)
        y += 16
        write_box(page, fitz.Rect(right_x, y, right_x + right_w, y + 14), dates, body, 9, (0.2, 0.2, 0.2))
        y += 16
        write_box(
            page,
            fitz.Rect(right_x, y, right_x + right_w, y + 48),
            f"{marker}. {extra_roles(name)[0]}",
            body,
            10,
        )
        y += 56
    return doc


def render_complex(profile: dict) -> fitz.Document:
    page_size = profile["page_size"]
    body_key, bold_key = FONT_PAIRS[0]
    doc = new_doc(page_size)
    page = doc[0]
    body, bold = register_fonts(page, body_key, bold_key)
    width, height = page.rect.width, page.rect.height
    name = profile["name"]
    email = profile["email"]
    phone = profile["phone"]
    jobs = profile["jobs"]

    # Sidebar + header band + decorative circles (icons) + overlapping cards.
    page.draw_rect(fitz.Rect(0, 0, 150, height), color=(0.10, 0.18, 0.32), fill=(0.10, 0.18, 0.32))
    page.draw_rect(fitz.Rect(150, 0, width, 88), color=(0.16, 0.42, 0.55), fill=(0.16, 0.42, 0.55))
    page.draw_circle(fitz.Point(75, 70), 28, color=(0.85, 0.9, 0.95), fill=(0.85, 0.9, 0.95))
    page.draw_circle(fitz.Point(width - 40, 44), 16, color=(1, 1, 1), fill=(0.95, 0.72, 0.22))
    page.draw_rect(fitz.Rect(170, 110, width - 28, 250), color=(0.88, 0.90, 0.93), fill=(0.95, 0.96, 0.98))
    page.draw_rect(fitz.Rect(190, 220, width - 48, 380), color=(0.75, 0.78, 0.82), fill=(1, 1, 1))

    write_box(page, fitz.Rect(24, 110, 138, 200), f"{name}\n{email}\n{phone}", body, 8, (1, 1, 1))
    write_box(page, fitz.Rect(24, 220, 138, 360), f"Skills\n{skills_line()}\nSidebar token {profile['id']}", body, 8, (0.9, 0.93, 0.96))
    write_box(page, fitz.Rect(170, 28, width - 80, 70), f"{name}  ·  {jobs[0][2]}", bold, 16, (1, 1, 1))
    write_box(
        page,
        fitz.Rect(180, 122, width - 40, 200),
        summary_for(name, jobs[0][2]),
        body,
        10,
    )
    y = 236
    for employer, dates, title in jobs[:3]:
        write_box(page, fitz.Rect(204, y, width - 60, y + 14), f"{title} — {employer}", bold, 11)
        y += 14
        write_box(page, fitz.Rect(204, y, width - 60, y + 14), dates, body, 9, (0.25, 0.25, 0.25))
        y += 28
    return doc


def rasterize_pages(src: fitz.Document, page_indexes: list[int] | None = None, dpi: int = 140) -> fitz.Document:
    indexes = page_indexes if page_indexes is not None else list(range(len(src)))
    out = fitz.open()
    for i in indexes:
        page = src[i]
        pix = page.get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False)
        new_page = out.new_page(width=page.rect.width, height=page.rect.height)
        new_page.insert_image(page.rect, pixmap=pix)
    return out


def append_pages(dest: fitz.Document, src: fitz.Document) -> None:
    dest.insert_pdf(src)


def expected_text_from_doc(doc: fitz.Document) -> str:
    return "\n".join(page.get_text("text") for page in doc)


def save_pair(doc: fitz.Document, record: dict) -> None:
    pdf_path = FILES / f"{record['id']}.pdf"
    json_path = FILES / f"{record['id']}.expected.json"
    doc.save(pdf_path)
    record["pdf"] = str(pdf_path.relative_to(ROOT)).replace("\\", "/")
    record["page_count"] = doc.page_count
    record["source_char_count"] = len("".join(expected_text_from_doc(doc).split()))
    json_path.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    doc.close()


def build_simple_records() -> list[dict]:
    records = []
    for i, (name, email, phone) in enumerate(PEOPLE):
        pages = 1 if i < 20 else (2 if i < 27 else 3)
        jobs = jobs_for(i, 2 if pages == 1 else (3 if pages == 2 else 4))
        rec = {
            "id": f"simple-{i + 1:03d}",
            "class": "simple",
            "name": name,
            "email": email,
            "phone": phone,
            "dates": [job[1] for job in jobs],
            "employers": [job[0] for job in jobs],
            "jobs": jobs,
            "page_size": page_size_for(i),
            "pages": pages,
            "font_index": i % len(FONT_PAIRS),
            "link": f"https://example.test/{email.split('@')[0]}" if i % 3 == 0 else None,
            "ligatures": i in {10, 27},
            "index": i,
            "held_out": i >= 24,
            "expect_scan_detect": False,
        }
        records.append(rec)
    return records


def build_two_column_records() -> list[dict]:
    records = []
    picks = [0, 2, 5, 11, 18, 26, 27, 28]
    for n, person_i in enumerate(picks):
        name, email, phone = PEOPLE[person_i]
        jobs = jobs_for(person_i, 3)
        rec = {
            "id": f"two-column-{n + 1:02d}",
            "class": "two_column",
            "name": name,
            "email": email,
            "phone": phone,
            "dates": [job[1] for job in jobs],
            "employers": [job[0] for job in jobs],
            "jobs": jobs,
            "page_size": page_size_for(n),
            "pages": 1,
            "font_index": n % len(FONT_PAIRS),
            "left_only": [
                f"LEFT-CONTACT-{n + 1:02d}",
                f"LEFT-SKILL-{n + 1:02d}",
                f"LEFT-EDU-{n + 1:02d}",
            ],
            "right_only": [
                f"RIGHT-ROLE-A-{n + 1:02d}",
                f"RIGHT-ROLE-B-{n + 1:02d}",
                f"RIGHT-ROLE-C-{n + 1:02d}",
            ],
            "index": n,
            "held_out": n >= 6,
            "expect_scan_detect": False,
        }
        records.append(rec)
    return records


def build_complex_records() -> list[dict]:
    records = []
    picks = [1, 27, 29]
    for n, person_i in enumerate(picks):
        name, email, phone = PEOPLE[person_i]
        jobs = jobs_for(person_i + 2, 3)
        rec = {
            "id": f"complex-{n + 1:02d}",
            "class": "complex",
            "name": name,
            "email": email,
            "phone": phone,
            "dates": [job[1] for job in jobs],
            "employers": [job[0] for job in jobs],
            "jobs": jobs,
            "page_size": page_size_for(n),
            "pages": 1,
            "index": n,
            "held_out": n >= 2,
            "expect_scan_detect": False,
        }
        records.append(rec)
    return records


def build_scanned_records() -> list[dict]:
    specs = [
        ("scanned-01", 0, "full_scan", False),
        ("scanned-02", 3, "full_scan", False),
        ("scanned-03", 8, "full_scan", False),
        ("scanned-04", 12, "mixed_text_then_scan", False),
        ("scanned-05", 16, "mixed_scan_then_text", True),
        ("scanned-06", 27, "low_density_caption", True),
    ]
    records = []
    for fid, person_i, kind, held_out in specs:
        name, email, phone = PEOPLE[person_i]
        jobs = jobs_for(person_i, 2)
        rec = {
            "id": fid,
            "class": "scanned_mixed",
            "name": name,
            "email": email,
            "phone": phone,
            "dates": [job[1] for job in jobs],
            "employers": [job[0] for job in jobs],
            "jobs": jobs,
            "page_size": "letter" if person_i % 2 == 0 else "a4",
            "pages": 2 if kind.startswith("mixed") else 1,
            "scan_kind": kind,
            "font_index": 0,
            "index": person_i,
            "held_out": held_out,
            "expect_scan_detect": True,
            "link": None,
            "ligatures": False,
        }
        records.append(rec)
    return records


def expected_text_for_profile(profile: dict, rendered: fitz.Document | None = None) -> str:
    """Ground-truth text from the text-bearing source, not from a rasterized page."""
    if rendered is not None:
        return expected_text_from_doc(rendered)
    chunks = [
        profile["name"],
        profile["email"],
        profile["phone"],
        *profile["dates"],
        *profile["employers"],
        skills_line(),
        education_line(),
        summary_for(profile["name"], profile["jobs"][0][2]),
    ]
    if profile.get("left_only"):
        chunks.extend(profile["left_only"])
    if profile.get("right_only"):
        chunks.extend(profile["right_only"])
    return "\n".join(chunks)


def generate() -> dict:
    if FIXTURES.exists():
        shutil.rmtree(FIXTURES)
    FILES.mkdir(parents=True)

    manifest_files: list[dict] = []
    held_out: list[str] = []

    for rec in build_simple_records():
        source = render_simple(rec)
        rec["expected_text"] = expected_text_from_doc(source)
        rec["jobs"] = [list(j) for j in rec["jobs"]]
        rec["dates"] = [j[1] for j in rec["jobs"]]
        rec["employers"] = [j[0] for j in rec["jobs"]]
        save_pair(source, rec)
        manifest_files.append(_manifest_entry(rec))
        if rec["held_out"]:
            held_out.append(rec["id"])

    for rec in build_two_column_records():
        source = render_two_column(rec)
        rec["expected_text"] = expected_text_from_doc(source)
        rec["jobs"] = [list(j) for j in rec["jobs"]]
        save_pair(source, rec)
        manifest_files.append(_manifest_entry(rec))
        if rec["held_out"]:
            held_out.append(rec["id"])

    for rec in build_complex_records():
        source = render_complex(rec)
        rec["expected_text"] = expected_text_from_doc(source)
        rec["jobs"] = [list(j) for j in rec["jobs"]]
        save_pair(source, rec)
        manifest_files.append(_manifest_entry(rec))
        if rec["held_out"]:
            held_out.append(rec["id"])

    for rec in build_scanned_records():
        source = render_simple(rec)
        rec["expected_text"] = expected_text_from_doc(source)
        rec["jobs"] = [list(j) for j in rec["jobs"]]
        rec["dates"] = [j[1] for j in rec["jobs"]]
        rec["employers"] = [j[0] for j in rec["jobs"]]
        kind = rec["scan_kind"]
        if kind == "full_scan":
            scanned = rasterize_pages(source)
            source.close()
            save_pair(scanned, rec)
        elif kind == "mixed_text_then_scan":
            if source.page_count < 2:
                page = add_page(source, rec["page_size"])
                body, bold = register_fonts(page, "arial", "arialbd")
                write_box(
                    page,
                    fitz.Rect(56, 56, page.rect.width - 56, 120),
                    "Additional experience page for mixed scan detection.",
                    body,
                    12,
                )
                rec["expected_text"] = expected_text_from_doc(source)
            text_page = fitz.open()
            text_page.insert_pdf(source, from_page=0, to_page=0)
            image_src = rasterize_pages(source, [min(1, source.page_count - 1)])
            mixed = fitz.open()
            mixed.insert_pdf(text_page)
            mixed.insert_pdf(image_src)
            text_page.close()
            image_src.close()
            source.close()
            save_pair(mixed, rec)
        elif kind == "mixed_scan_then_text":
            image_src = rasterize_pages(source, [0])
            text_page = fitz.open()
            last = source.page_count - 1
            text_page.insert_pdf(source, from_page=last, to_page=last)
            mixed = fitz.open()
            mixed.insert_pdf(image_src)
            mixed.insert_pdf(text_page)
            image_src.close()
            text_page.close()
            source.close()
            save_pair(mixed, rec)
        else:
            # Low-density caption: one short line plus a large image of the resume.
            scanned = rasterize_pages(source)
            page = scanned[0]
            page.insert_text((56, 36), "Scanned copy — not a text PDF", fontsize=8, fontname="helv")
            source.close()
            save_pair(scanned, rec)
        manifest_files.append(_manifest_entry(rec))
        if rec["held_out"]:
            held_out.append(rec["id"])

    counts = {
        "simple": sum(1 for f in manifest_files if f["class"] == "simple"),
        "two_column": sum(1 for f in manifest_files if f["class"] == "two_column"),
        "complex": sum(1 for f in manifest_files if f["class"] == "complex"),
        "scanned_mixed": sum(1 for f in manifest_files if f["class"] == "scanned_mixed"),
    }
    manifest = {
        "story": "US-070",
        "rights": "synthetic-only",
        "identities": "obviously fake; example.test and NANP 555 numbers",
        "held_out_policy": "Do not tune thresholds or reconstruction on held-out ids.",
        "qa_corpus_target": {"simple": 30, "two_column": 15, "complex": 5, "scanned_mixed": 10, "total": 60},
        "spike_counts": {**counts, "total": sum(counts.values())},
        "corpus_gap": {
            "simple": 30 - counts["simple"],
            "two_column": 15 - counts["two_column"],
            "complex": 5 - counts["complex"],
            "scanned_mixed": 10 - counts["scanned_mixed"],
        },
        "held_out": held_out,
        "files": manifest_files,
    }
    (FIXTURES / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (FIXTURES / "held_out.json").write_text(json.dumps({"ids": held_out}, indent=2) + "\n", encoding="utf-8")
    return manifest


def _manifest_entry(rec: dict) -> dict:
    return {
        "id": rec["id"],
        "class": rec["class"],
        "pdf": rec["pdf"],
        "expected": f"fixtures/files/{rec['id']}.expected.json",
        "page_size": rec["page_size"],
        "held_out": rec["held_out"],
        "expect_scan_detect": rec["expect_scan_detect"],
        "name": rec["name"],
        "email": rec["email"],
    }


if __name__ == "__main__":
    manifest = generate()
    print(json.dumps({"counts": manifest["spike_counts"], "held_out": manifest["held_out"]}, indent=2))
