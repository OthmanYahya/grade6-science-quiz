#!/usr/bin/env python3
"""
Parser script to convert Science_L6H_Ch1_Sections_1.2-1.3_Predicted_Questions.md
into questions.json with full validation.
"""

import re
import json
import os
import sys

MD_FILE = "Science_L6H_Ch1_Sections_1.2-1.3_Predicted_Questions.md"
OUTPUT_JSON = "questions.json"
IMAGES_DIR = "images"

def markdown_table_to_html(md_table):
    """Converts a standard markdown table into semantic HTML."""
    if not md_table:
        return None
    lines = [l.strip() for l in md_table.strip().split("\n") if l.strip()]
    if len(lines) < 2:
        return None
    
    # Header
    def split_row(row_str):
        cells = [c.strip() for c in row_str.strip("|").split("|")]
        return cells
    
    headers = split_row(lines[0])
    rows = []
    # Skip separator line (line 1)
    for line in lines[2:]:
        rows.append(split_row(line))
        
    html = ['<div class="table-wrap"><table class="specimen-table">']
    html.append('<thead><tr>')
    for h in headers:
        html.append(f'<th>{inline_markdown_to_html(h)}</th>')
    html.append('</tr></thead><tbody>')
    for r in rows:
        html.append('<tr>')
        for c in r:
            html.append(f'<td>{inline_markdown_to_html(c)}</td>')
        html.append('</tr>')
    html.append('</tbody></table></div>')
    return "".join(html)

def inline_markdown_to_html(text):
    """Lightweight converter for inline markdown: bold, italic, code."""
    if not text:
        return ""
    # Bold **text**
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    # Italic *text*
    t = re.sub(r'\*([^*]+?)\*', r'<em>\1</em>', t)
    # Backticks `code`
    t = re.sub(r'`([^`]+?)`', r'<code>\1</code>', t)
    return t

def parse_markdown():
    if not os.path.exists(MD_FILE):
        print(f"Error: {MD_FILE} not found!", file=sys.stderr)
        sys.exit(1)

    with open(MD_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    sec12_pos = content.find("# SECTION 1.2 – CLASSIFYING ORGANISMS")
    sec13_pos = content.find("# SECTION 1.3 – HEREDITY AND INHERITANCE")

    if sec12_pos == -1 or sec13_pos == -1:
        print("Error: Could not locate section headers in markdown!", file=sys.stderr)
        sys.exit(1)

    sections = [
        ("1.2", "Classifying Organisms", content[sec12_pos:sec13_pos]),
        ("1.3", "Heredity and Inheritance", content[sec13_pos:])
    ]

    parsed_questions = []
    image_paths_checked = set()

    for sec_id, sec_title, sec_text in sections:
        raw_blocks = re.split(r"(?m)^(?=###\s+Q)", sec_text)
        for block in raw_blocks:
            block = block.strip()
            if not block.startswith("###"):
                continue
            lines = block.split("\n")
            header = lines[0].strip()

            hm = re.match(r"^###\s+Q(\d+)\s+·\s+([^·]+)\s+·\s+([^·]+)\s+·\s+([A-Za-z]+)", header)
            if not hm:
                print(f"Error: Failed header match on: {header}", file=sys.stderr)
                continue

            qnum_str, qtype_str, lp_str, level_str = hm.groups()
            qnum = int(qnum_str)
            qtype = qtype_str.strip()
            lp = lp_str.strip()
            level = level_str.strip()
            sec_code = sec_id.replace(".", "")
            qid = f"s{sec_code}_q{qnum}"

            body = "\n".join(lines[1:]).strip()

            # Image extraction
            img_match = re.search(r"!\[(.*?)\]\((.*?)\)", body)
            image_data = None
            if img_match:
                alt, src = img_match.groups()
                src = src.strip()
                alt = alt.strip()
                if not os.path.exists(src):
                    print(f"Error: Image {src} in {qid} does not exist!", file=sys.stderr)
                    sys.exit(1)
                image_paths_checked.add(src)
                image_data = {
                    "alt": alt,
                    "src": src
                }
                body = body.replace(img_match.group(0), "").strip()

            # Table extraction
            table_lines = [l for l in body.split("\n") if l.strip().startswith("|") and l.strip().endswith("|")]
            table_markdown = None
            table_html = None
            if len(table_lines) >= 2:
                table_markdown = "\n".join(table_lines)
                table_html = markdown_table_to_html(table_markdown)
                body = body.replace(table_markdown, "").strip()

            def extract_field(label_pattern, text_content):
                m = re.search(r"\*\*" + label_pattern + r":\*\*\s*([\s\S]*?)(?=\n\n\*\*|\n\*\*|$)", text_content)
                return m.group(1).strip() if m else None

            hint = extract_field(r"Hint", body)
            explanation = extract_field(r"Explanation", body)

            q_obj = {
                "id": qid,
                "number": qnum,
                "section": sec_id,
                "section_title": sec_title,
                "type": qtype,
                "lp": lp,
                "level": level,
                "hint": hint,
                "explanation": explanation,
                "image": image_data,
                "table_markdown": table_markdown,
                "table_html": table_html
            }

            if qtype == "MCQ":
                question_text = extract_field(r"Question", body)
                answer_text = extract_field(r"Answer", body)
                opts_matches = re.findall(r"^([A-D])\)\s+(.*)$", body, flags=re.MULTILINE)
                options = [{"key": k, "text": t.strip(), "html": inline_markdown_to_html(t.strip())} for k, t in opts_matches]
                if question_text:
                    question_text = re.split(r"\n[A-D]\)", question_text)[0].strip()
                q_obj["prompt"] = question_text
                q_obj["options"] = options
                q_obj["answer"] = answer_text[0] if answer_text else None

            elif qtype == "True/False":
                statement_text = extract_field(r"Statement", body)
                raw_answer = extract_field(r"Answer", body)
                is_true = raw_answer.lower().startswith("true") if raw_answer else False
                correction = None
                if raw_answer and "false." in raw_answer.lower():
                    correction = re.sub(r"^false\.\s*", "", raw_answer, flags=re.IGNORECASE).strip()
                q_obj["statement"] = statement_text
                q_obj["is_true"] = is_true
                q_obj["raw_answer"] = raw_answer
                q_obj["correction"] = correction

            elif qtype == "Find the Mistake":
                student_answer = extract_field(r"Student\x27s answer", body)
                student_table_flag = "**Student's table:**" in block
                question_text = extract_field(r"Question", body)
                mistake = extract_field(r"Mistake", body)
                correct_ans = extract_field(r"Correct answer", body)
                q_obj["student_answer"] = student_answer
                q_obj["student_table_flag"] = student_table_flag
                q_obj["question"] = question_text
                q_obj["mistake"] = mistake
                q_obj["correct_answer"] = correct_ans

            elif qtype == "Written":
                question_text = extract_field(r"Question", body)
                model_ans = extract_field(r"Model answer(?:\s+\(one possibility\))?", body)
                q_obj["prompt"] = question_text
                q_obj["model_answer"] = model_ans

            parsed_questions.append(q_obj)

    # Verification
    assert len(parsed_questions) == 200, f"Expected 200 questions, got {len(parsed_questions)}"
    
    sec12_qs = [q for q in parsed_questions if q["section"] == "1.2"]
    sec13_qs = [q for q in parsed_questions if q["section"] == "1.3"]
    assert len(sec12_qs) == 100, f"Expected 100 in Sec 1.2, got {len(sec12_qs)}"
    assert len(sec13_qs) == 100, f"Expected 100 in Sec 1.3, got {len(sec13_qs)}"

    def check_types(qs, sec_name):
        type_counts = {}
        for q in qs:
            type_counts[q["type"]] = type_counts.get(q["type"], 0) + 1
        expected = {"MCQ": 36, "True/False": 24, "Find the Mistake": 20, "Written": 20}
        assert type_counts == expected, f"{sec_name} counts mismatch: got {type_counts}"
        return type_counts

    c12 = check_types(sec12_qs, "Section 1.2")
    c13 = check_types(sec13_qs, "Section 1.3")

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(parsed_questions, f, indent=2, ensure_ascii=False)

    js_file = "questions-data.js"
    with open(js_file, "w", encoding="utf-8") as f:
        f.write("/* Generated by parse_questions.py */\nwindow.SCIENCE_QUESTIONS = ")
        json.dump(parsed_questions, f, indent=2, ensure_ascii=False)
        f.write(";\n")

    print("==================================================")
    print("PARSING COMPLETE & VERIFIED SUCCESSFULLY!")
    print("==================================================")
    print(f"Total Questions Parsed: {len(parsed_questions)}")
    print(f"Unique Image Files Resolved and Verified: {len(image_paths_checked)} / 20")
    print("\nSection 1.2 – Classifying Organisms:")
    print(f"  Total: {len(sec12_qs)}")
    for t, c in c12.items():
        print(f"  - {t}: {c}")
    print("\nSection 1.3 – Heredity and Inheritance:")
    print(f"  Total: {len(sec13_qs)}")
    for t, c in c13.items():
        print(f"  - {t}: {c}")
    print(f"\nWritten to: {OUTPUT_JSON}")
    print("==================================================")

if __name__ == "__main__":
    parse_markdown()
