# US-070 fidelity spike

Local feasibility harness. Not a production worker. Conversion stays out of Next.js.

1. Create `.venv` and `pip install -r requirements.txt` (pinned PyMuPDF, pdf2docx, python-docx).
2. `python generate_fixtures.py` — synthetic `example.test` PDFs only.
3. `python harness.py` — inspect, convert, score by layout class.
4. Read `RESULTS.md`. Do not tune on `fixtures/held_out.json`.

PyMuPDF license remains [[ADR-003]] / US-071. Do not publish a worker image.
