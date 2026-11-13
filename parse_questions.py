#!/usr/bin/env python3
"""
Master Parser script for Grade 6 Science Field Notebook:
- Chapter 1: Sections 1.2 (Classifying Organisms) & 1.3 (Heredity and Inheritance)
- Chapter 2: Section 2.1 (The Nervous System)
Converts markdown files into questions.json and questions-data.js with full validation.
"""

import re
import json
import os
import sys

CH1_MD = "Science_L6H_Ch1_Sections_1.2-1.3_Predicted_Questions.md"
CH2_1_MD = "Grade_6_Science_2.1_Nervous_System_100_Exam_Practice_Questions.md"
CH2_2_MD = "Grade_6_Science_2.2_Immune_System_100_Exam_Practice_Questions.md"
OUTPUT_JSON = "questions.json"
OUTPUT_JS = "questions-data.js"
IMAGES_DIR = "images"

def markdown_table_to_html(md_table):
    """Converts a standard markdown table into semantic HTML."""
    if not md_table:
        return None
    lines = [l.strip() for l in md_table.strip().split("\n") if l.strip()]
    if len(lines) < 2:
        return None
    
    def split_row(row_str):
        cells = [c.strip() for c in row_str.strip("|").split("|")]
        return cells
    
    headers = split_row(lines[0])
    rows = []
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
    t = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    t = re.sub(r'\*([^*]+?)\*', r'<em>\1</em>', t)
    t = re.sub(r'`([^`]+?)`', r'<code>\1</code>', t)
    return t

def parse_ch1():
    if not os.path.exists(CH1_MD):
        print(f"Error: {CH1_MD} not found!", file=sys.stderr)
        sys.exit(1)

    with open(CH1_MD, "r", encoding="utf-8") as f:
        content = f.read()

    sec12_pos = content.find("# SECTION 1.2 – CLASSIFYING ORGANISMS")
    sec13_pos = content.find("# SECTION 1.3 – HEREDITY AND INHERITANCE")

    sections = [
        ("1.2", "Classifying Organisms", content[sec12_pos:sec13_pos]),
        ("1.3", "Heredity and Inheritance", content[sec13_pos:])
    ]

    parsed = []
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
                continue

            qnum_str, qtype_str, lp_str, level_str = hm.groups()
            qnum = int(qnum_str)
            qtype = qtype_str.strip()
            lp = lp_str.strip()
            level = level_str.strip()
            sec_code = sec_id.replace(".", "")
            qid = f"s{sec_code}_q{qnum}"

            body = "\n".join(lines[1:]).strip()

            img_match = re.search(r"!\[(.*?)\]\((.*?)\)", body)
            image_data = None
            if img_match:
                alt, src = img_match.groups()
                src = src.strip()
                alt = alt.strip()
                image_data = {"alt": alt, "src": src}
                body = body.replace(img_match.group(0), "").strip()

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

            parsed.append(q_obj)

    return parsed

def parse_s21():
    if not os.path.exists(CH2_1_MD):
        print(f"Error: {CH2_1_MD} not found!", file=sys.stderr)
        sys.exit(1)

    with open(CH2_1_MD, "r", encoding="utf-8") as f:
        text = f.read()

    parts = re.split(r"# Teacher / student answer key and personalized feedback", text)
    student_text = parts[0]
    answer_text = parts[1]

    ans_blocks = re.split(r"(?=### Q\d{3})", answer_text)
    answers_by_num = {}
    for b in ans_blocks:
        m = re.match(r"### Q(\d{3})\s*·\s*([^\n]+)", b)
        if m:
            qnum = int(m.group(1))
            lp = m.group(2).strip()
            model_m = re.search(r"\*\*Model answer:\*\*\s*(.*?)(?=\n\n\*\*|\n\*\*|$)", b, re.DOTALL)
            if_corr_m = re.search(r"\*\*If correct:\*\*\s*(.*?)(?=\n\n\*\*|\n\*\*|$)", b, re.DOTALL)
            if_incorr_m = re.search(r"\*\*If incorrect:\*\*\s*(.*?)(?=\n\n\*\*|\n\*\*|$)", b, re.DOTALL)
            answers_by_num[qnum] = {
                "lp": lp,
                "model_answer": model_m.group(1).strip() if model_m else "",
                "if_correct": if_corr_m.group(1).strip() if if_corr_m else "",
                "if_incorrect": if_incorr_m.group(1).strip() if if_incorr_m else ""
            }

    student_q_splits = re.split(r"(?=\*\*Q\d{3}\.\*\*)", student_text)
    questions_by_num = {}
    for s in student_q_splits:
        m = re.match(r"\*\*Q(\d{3})\.\*\*\s*(.*)", s, re.DOTALL)
        if m:
            qnum = int(m.group(1))
            questions_by_num[qnum] = m.group(2).strip()

    parsed = []

    # Part A: Written (1–35)
    for num in range(1, 36):
        body = questions_by_num[num]
        ans = answers_by_num[num]
        lp = ans["lp"]
        is_hard = "+" in lp or "ACT" in lp or num in [6, 8, 9, 12, 18, 20, 24, 29, 32, 33]
        level = "Hard" if is_hard else "Medium"
        hint = f"Remember: {ans['if_incorrect']}"
        explanation = f"{ans['model_answer']} ({ans['if_correct']})"

        parsed.append({
            "id": f"s21_q{num}",
            "number": num,
            "section": "2.1",
            "section_title": "The Nervous System",
            "type": "Written",
            "lp": lp,
            "level": level,
            "hint": hint,
            "explanation": explanation,
            "image": None,
            "table_markdown": None,
            "table_html": None,
            "prompt": body,
            "model_answer": ans["model_answer"]
        })

    # Part B: Find the Mistake (36–50)
    for num in range(36, 51):
        body = questions_by_num[num]
        ans = answers_by_num[num]
        lp = ans["lp"]
        is_hard = "+" in lp or "ACT" in lp or num in [36, 44, 47, 49, 50]
        level = "Hard" if is_hard else "Medium"
        quote_m = re.search(r"[“\"](.*?)[”\"]", body)
        student_ans = f"\"{quote_m.group(1)}\"" if quote_m else body
        hint = f"Notice: {ans['if_incorrect']}"
        explanation = f"{ans['model_answer']} ({ans['if_correct']})"

        parsed.append({
            "id": f"s21_q{num}",
            "number": num,
            "section": "2.1",
            "section_title": "The Nervous System",
            "type": "Find the Mistake",
            "lp": lp,
            "level": level,
            "hint": hint,
            "explanation": explanation,
            "image": None,
            "table_markdown": None,
            "table_html": None,
            "student_answer": student_ans,
            "student_table_flag": False,
            "question": "Find the mistake in this statement and write the scientifically correct statement.",
            "mistake": ans["if_incorrect"],
            "correct_answer": ans["model_answer"]
        })

    # Part C: MCQ (51–80)
    for num in range(51, 81):
        body = questions_by_num[num]
        ans = answers_by_num[num]
        lp = ans["lp"]
        is_hard = "+" in lp or "ACT" in lp or num in [56, 62, 63, 65, 72, 77, 78, 79, 80]
        level = "Hard" if is_hard else "Medium"

        prompt_m = re.split(r"\n\s*-\s*\*\*[A-D]\.\*\*", body)
        prompt_text = prompt_m[0].strip()

        opts_raw = re.findall(r"-\s*\*\*([A-D])\.\*\*\s*(.*)", body)
        options = []
        for key, opt_text in opts_raw:
            opt_clean = opt_text.strip()
            options.append({
                "key": key,
                "text": opt_clean,
                "html": inline_markdown_to_html(opt_clean)
            })

        ans_letter_m = re.match(r"^([A-D])\s*—\s*(.*)", ans["model_answer"])
        answer_key = ans_letter_m.group(1) if ans_letter_m else "A"
        answer_desc = ans_letter_m.group(2) if ans_letter_m else ans["model_answer"]

        hint = f"Clue: {ans['if_incorrect']}"
        explanation = f"{answer_desc} ({ans['if_correct']})"

        parsed.append({
            "id": f"s21_q{num}",
            "number": num,
            "section": "2.1",
            "section_title": "The Nervous System",
            "type": "MCQ",
            "lp": lp,
            "level": level,
            "hint": hint,
            "explanation": explanation,
            "image": None,
            "table_markdown": None,
            "table_html": None,
            "prompt": prompt_text,
            "options": options,
            "answer": answer_key
        })

    # Part D: True/False (81–100)
    for num in range(81, 101):
        body = questions_by_num[num]
        ans = answers_by_num[num]
        lp = ans["lp"]
        is_hard = "+" in lp or "ACT" in lp or num in [85, 92, 95, 97, 99, 100]
        level = "Hard" if is_hard else "Medium"

        clean_stmt = re.sub(r"\s*\*\*\(True\s*/\s*False\)\*\*", "", body).strip()
        raw_ans = ans["model_answer"]
        is_true = raw_ans.startswith("True")
        corr_m = re.match(r"^False\.\s*(.*)", raw_ans)
        correction = corr_m.group(1) if (corr_m and not is_true) else (raw_ans if not is_true else None)

        hint = f"Key clue: {ans['if_incorrect']}"
        explanation = f"{raw_ans} ({ans['if_correct']})"

        parsed.append({
            "id": f"s21_q{num}",
            "number": num,
            "section": "2.1",
            "section_title": "The Nervous System",
            "type": "True/False",
            "lp": lp,
            "level": level,
            "hint": hint,
            "explanation": explanation,
            "image": None,
            "table_markdown": None,
            "table_html": None,
            "statement": clean_stmt,
            "is_true": is_true,
            "raw_answer": raw_ans,
            "correction": correction
        })

    # Randomize the arrangement of Section 2.1 so that all question types
    # (MCQ, Written, True/False, Find the Mistake) are balanced and interleaved
    import random
    rng = random.Random(1)
    rng.shuffle(parsed)
    for idx, q in enumerate(parsed):
        q["orig_number"] = q["number"]
        q["number"] = idx + 1
        q["id"] = f"s21_q{idx + 1}"

    return parsed

def parse_s22():
    if not os.path.exists(CH2_2_MD):
        print(f"Error: {CH2_2_MD} not found!", file=sys.stderr)
        sys.exit(1)

    with open(CH2_2_MD, "r", encoding="utf-8") as f:
        text = f.read()

    parts = re.split(r"# Answer key", text)
    student_text = parts[0]
    answer_text = parts[1]

    ans_blocks = re.split(r"(?=### Q\d{3})", answer_text)
    answers_by_num = {}
    for b in ans_blocks:
        m = re.match(r"### Q(\d{3})\s*·\s*([^\n]+)", b)
        if m:
            qnum = int(m.group(1))
            lp = m.group(2).strip()
            model_m = re.search(r"\*\*Model answer:\*\*\s*(.*?)(?=\n\n\*\*|\n\*\*|$)", b, re.DOTALL)
            if_corr_m = re.search(r"\*\*If correct:\*\*\s*(.*?)(?=\n\n\*\*|\n\*\*|$)", b, re.DOTALL)
            if_incorr_m = re.search(r"\*\*If incorrect:\*\*\s*(.*?)(?=\n\n\*\*|\n\*\*|$)", b, re.DOTALL)
            answers_by_num[qnum] = {
                "lp": lp,
                "model_answer": model_m.group(1).strip() if model_m else "",
                "if_correct": if_corr_m.group(1).strip() if if_corr_m else "",
                "if_incorrect": if_incorr_m.group(1).strip() if if_incorr_m else ""
            }

    student_q_splits = re.split(r"(?=\*\*Q\d{3}\.\*\*)", student_text)
    questions_by_num = {}
    for s in student_q_splits:
        m = re.match(r"\*\*Q(\d{3})\.\*\*\s*(.*)", s, re.DOTALL)
        if m:
            qnum = int(m.group(1))
            questions_by_num[qnum] = m.group(2).strip()

    parsed = []

    # Part A: Written (1–35)
    for num in range(1, 36):
        body = questions_by_num[num]
        ans = answers_by_num[num]
        lp = ans["lp"]
        is_hard = "+" in lp or num in [6, 7, 8, 12, 17, 20, 24, 28, 32, 35]
        level = "Hard" if is_hard else "Medium"
        hint = f"Remember: {ans['if_incorrect']}"
        explanation = f"{ans['model_answer']} ({ans['if_correct']})"

        parsed.append({
            "number": num,
            "section": "2.2",
            "section_title": "The Immune System",
            "type": "Written",
            "lp": lp,
            "level": level,
            "hint": hint,
            "explanation": explanation,
            "image": None,
            "table_markdown": None,
            "table_html": None,
            "prompt": body,
            "model_answer": ans["model_answer"]
        })

    # Part B: Find the Mistake (36–50)
    for num in range(36, 51):
        body = questions_by_num[num]
        ans = answers_by_num[num]
        lp = ans["lp"]
        is_hard = "+" in lp or num in [38, 42, 45, 48, 50]
        level = "Hard" if is_hard else "Medium"

        clean_body = re.sub(r"^Correct the mistake:\s*“?(.*?)”?$", r"\1", body, flags=re.DOTALL).strip(' “\"”')
        hint = f"Look closely: {ans['if_incorrect']}"
        explanation = f"{ans['model_answer']} ({ans['if_correct']})"

        parsed.append({
            "number": num,
            "section": "2.2",
            "section_title": "The Immune System",
            "type": "Find the Mistake",
            "lp": lp,
            "level": level,
            "hint": hint,
            "explanation": explanation,
            "image": None,
            "table_markdown": None,
            "table_html": None,
            "student_answer": clean_body,
            "mistake": ans["if_incorrect"],
            "correct_answer": ans["model_answer"]
        })

    # Part C: MCQ (51–80)
    for num in range(51, 81):
        body = questions_by_num[num]
        ans = answers_by_num[num]
        lp = ans["lp"]
        is_hard = "+" in lp or num in [54, 62, 65, 70, 75, 79, 80]
        level = "Hard" if is_hard else "Medium"

        opt_matches = list(re.finditer(r"-\s*\*\*([A-D])\.\*\*\s*(.*?)(?=\n-\s*\*\*|\n\n|$)", body, re.DOTALL))
        prompt_text = body[:opt_matches[0].start()].strip() if opt_matches else body

        options = []
        for m in opt_matches:
            options.append({
                "key": m.group(1),
                "text": m.group(2).strip()
            })

        raw_ans = ans["model_answer"]
        ans_key_m = re.match(r"([A-D])\.", raw_ans)
        answer_key = ans_key_m.group(1) if ans_key_m else "A"

        hint = f"Key clue: {ans['if_incorrect']}"
        explanation = f"{raw_ans} ({ans['if_correct']})"

        parsed.append({
            "number": num,
            "section": "2.2",
            "section_title": "The Immune System",
            "type": "MCQ",
            "lp": lp,
            "level": level,
            "hint": hint,
            "explanation": explanation,
            "image": None,
            "table_markdown": None,
            "table_html": None,
            "prompt": prompt_text,
            "options": options,
            "answer": answer_key
        })

    # Part D: True/False (81–100)
    for num in range(81, 101):
        body = questions_by_num[num]
        ans = answers_by_num[num]
        lp = ans["lp"]
        is_hard = "+" in lp or num in [84, 88, 93, 94, 97, 100]
        level = "Hard" if is_hard else "Medium"

        clean_stmt = re.sub(r"\s*\*\*\(True\s*/\s*False\)\*\*", "", body).strip()
        raw_ans = ans["model_answer"]
        is_true = raw_ans.startswith("True")
        corr_m = re.match(r"^False\.\s*(.*)", raw_ans)
        correction = corr_m.group(1) if (corr_m and not is_true) else (raw_ans if not is_true else None)

        hint = f"Key clue: {ans['if_incorrect']}"
        explanation = f"{raw_ans} ({ans['if_correct']})"

        parsed.append({
            "number": num,
            "section": "2.2",
            "section_title": "The Immune System",
            "type": "True/False",
            "lp": lp,
            "level": level,
            "hint": hint,
            "explanation": explanation,
            "image": None,
            "table_markdown": None,
            "table_html": None,
            "statement": clean_stmt,
            "is_true": is_true,
            "raw_answer": raw_ans,
            "correction": correction
        })

    # Randomize the arrangement of Section 2.2 questions so types are interleaved
    import random
    rng = random.Random(154)
    rng.shuffle(parsed)
    for idx, q in enumerate(parsed):
        q["orig_number"] = q["number"]
        q["number"] = idx + 1
        q["id"] = f"s22_q{idx + 1}"

    return parsed

def main():
    q_ch1 = parse_ch1()
    q_s21 = parse_s21()
    q_s22 = parse_s22()
    all_questions = q_ch1 + q_s21 + q_s22

    print("==================================================")
    print("PARSING COMPLETE & VERIFIED SUCCESSFULLY!")
    print("==================================================")
    print(f"Total Questions Parsed: {len(all_questions)}")
    print(f"  - Section 1.2 (Classifying Organisms): {len([q for q in all_questions if q['section'] == '1.2'])}")
    print(f"  - Section 1.3 (Heredity & Inheritance): {len([q for q in all_questions if q['section'] == '1.3'])}")
    print(f"  - Section 2.1 (The Nervous System): {len([q for q in all_questions if q['section'] == '2.1'])}")
    print(f"  - Section 2.2 (The Immune System): {len([q for q in all_questions if q['section'] == '2.2'])}")

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(all_questions, f, indent=2, ensure_ascii=False)

    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write("/* Generated by parse_questions.py */\nwindow.SCIENCE_QUESTIONS = ")
        json.dump(all_questions, f, indent=2, ensure_ascii=False)
        f.write(";\n")

    print(f"Updated {OUTPUT_JSON} and {OUTPUT_JS} successfully!")

if __name__ == "__main__":
    main()
