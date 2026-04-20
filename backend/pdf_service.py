"""
PDF 生成服务 - 生成可打印的练习题 PDF
使用 reportlab 库，支持中文
"""
import os
import json
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Register Chinese TTF font (embedded in PDF for proper display)
CHINESE_FONT = 'Helvetica'  # fallback
_FONT_PATHS = [
    ('/System/Library/Fonts/STHeiti Medium.ttc', 0),     # macOS
    ('/System/Library/Fonts/STHeiti Light.ttc', 0),       # macOS
    ('/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', 0),  # Linux
    ('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 0),  # Linux
    ('C:/Windows/Fonts/msyh.ttc', 0),                     # Windows
    ('C:/Windows/Fonts/simsun.ttc', 0),                    # Windows
]
for _fpath, _idx in _FONT_PATHS:
    if os.path.exists(_fpath):
        try:
            pdfmetrics.registerFont(TTFont('ChineseFont', _fpath, subfontIndex=_idx))
            CHINESE_FONT = 'ChineseFont'
            break
        except Exception:
            continue

EXPORTS_DIR = os.path.join(os.path.dirname(__file__), "exports")
os.makedirs(EXPORTS_DIR, exist_ok=True)


def get_chinese_styles():
    """获取中文样式"""
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name='ChineseTitle',
        fontName=CHINESE_FONT,
        fontSize=18,
        leading=24,
        alignment=1,  # Center
        spaceAfter=12,
        textColor=colors.HexColor('#1a1a2e')
    ))

    styles.add(ParagraphStyle(
        name='ChineseSubtitle',
        fontName=CHINESE_FONT,
        fontSize=12,
        leading=16,
        alignment=1,
        spaceAfter=8,
        textColor=colors.HexColor('#666666')
    ))

    styles.add(ParagraphStyle(
        name='ChineseHeading',
        fontName=CHINESE_FONT,
        fontSize=14,
        leading=20,
        spaceBefore=16,
        spaceAfter=8,
        textColor=colors.HexColor('#2d3436')
    ))

    styles.add(ParagraphStyle(
        name='ChineseLevelHeader',
        fontName=CHINESE_FONT,
        fontSize=13,
        leading=18,
        spaceBefore=14,
        spaceAfter=6,
        textColor=colors.HexColor('#ffffff'),
        backColor=colors.HexColor('#4F46E5'),
        borderPadding=(6, 10, 6, 10),
    ))

    styles.add(ParagraphStyle(
        name='ChineseBody',
        fontName=CHINESE_FONT,
        fontSize=11,
        leading=18,
        spaceAfter=6,
        textColor=colors.HexColor('#2d3436')
    ))

    styles.add(ParagraphStyle(
        name='ChineseQuestion',
        fontName=CHINESE_FONT,
        fontSize=11,
        leading=18,
        spaceBefore=10,
        spaceAfter=4,
        textColor=colors.HexColor('#1a1a2e'),
        leftIndent=0,
    ))

    styles.add(ParagraphStyle(
        name='ChineseOption',
        fontName=CHINESE_FONT,
        fontSize=10.5,
        leading=16,
        leftIndent=24,
        spaceAfter=2,
        textColor=colors.HexColor('#333333')
    ))

    styles.add(ParagraphStyle(
        name='ChineseAnswer',
        fontName=CHINESE_FONT,
        fontSize=10,
        leading=15,
        leftIndent=24,
        spaceAfter=4,
        textColor=colors.HexColor('#16a085')
    ))

    styles.add(ParagraphStyle(
        name='ChineseSolution',
        fontName=CHINESE_FONT,
        fontSize=10,
        leading=15,
        leftIndent=24,
        spaceAfter=8,
        textColor=colors.HexColor('#555555')
    ))

    styles.add(ParagraphStyle(
        name='ChineseFooter',
        fontName=CHINESE_FONT,
        fontSize=8,
        leading=12,
        alignment=1,
        textColor=colors.HexColor('#999999')
    ))

    styles.add(ParagraphStyle(
        name='ChineseSmall',
        fontName=CHINESE_FONT,
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#888888')
    ))

    return styles


def generate_practice_pdf(practice_data: dict, student_name: str = "",
                           include_answers: bool = True) -> str:
    """
    生成练习题 PDF

    Args:
        practice_data: 练习题数据（从 LLM 生成）
        student_name: 学生姓名
        include_answers: 是否包含答案和解析

    Returns:
        生成的 PDF 文件路径
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = student_name.replace(' ', '_') if student_name else 'practice'
    filename = f"practice_{safe_name}_{timestamp}.pdf"
    filepath = os.path.join(EXPORTS_DIR, filename)

    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=20*mm,
        bottomMargin=20*mm
    )

    styles = get_chinese_styles()
    story = []

    # === Title ===
    title = practice_data.get('title', f'{student_name}专项练习')
    story.append(Paragraph(title, styles['ChineseTitle']))

    # Subtitle
    description = practice_data.get('description', '')
    if description:
        story.append(Paragraph(description, styles['ChineseSubtitle']))

    # Student info & date
    info_text = f"学生: {student_name}    日期: {datetime.now().strftime('%Y年%m月%d日')}"
    story.append(Paragraph(info_text, styles['ChineseSmall']))

    story.append(Spacer(1, 6*mm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E5E7EB')))
    story.append(Spacer(1, 4*mm))

    # === Knowledge Points ===
    target_kps = practice_data.get('target_knowledge_points', [])
    if target_kps:
        kp_text = "针对知识点: " + "、".join(target_kps)
        story.append(Paragraph(kp_text, styles['ChineseBody']))
        story.append(Spacer(1, 3*mm))

    # === Questions by Level ===
    questions = practice_data.get('questions', [])

    # Group by level
    levels = {
        "基础巩固": {"color": "#22C55E", "icon": "★", "questions": []},
        "能力提升": {"color": "#3B82F6", "icon": "★★", "questions": []},
        "拓展挑战": {"color": "#EF4444", "icon": "★★★", "questions": []},
    }

    for q in questions:
        level = q.get('level', '基础巩固')
        if level in levels:
            levels[level]["questions"].append(q)
        else:
            # Try to match
            for lk in levels:
                if lk in level:
                    levels[lk]["questions"].append(q)
                    break
            else:
                levels["基础巩固"]["questions"].append(q)

    question_num = 0
    for level_name, level_info in levels.items():
        if not level_info["questions"]:
            continue

        # Level header
        color = level_info["color"]
        icon = level_info["icon"]

        story.append(Spacer(1, 4*mm))

        # Create level header with background
        level_style = ParagraphStyle(
            f'Level_{level_name}',
            parent=styles['ChineseBody'],
            fontSize=12,
            leading=18,
            spaceBefore=8,
            spaceAfter=8,
            textColor=colors.HexColor(color),
            fontName=CHINESE_FONT,
        )
        story.append(Paragraph(f"{icon} {level_name}（共{len(level_info['questions'])}题）", level_style))

        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor(color)))
        story.append(Spacer(1, 2*mm))

        # Questions
        for q in level_info["questions"]:
            question_num += 1
            q_text = q.get('question', '')
            difficulty = q.get('difficulty', 3)
            kp = q.get('knowledge_point', '')

            # Question text
            diff_stars = "●" * difficulty + "○" * (5 - difficulty)
            meta = f"  <font size='8' color='#999999'>[难度: {diff_stars}  知识点: {kp}]</font>" if kp else ""
            story.append(Paragraph(
                f"<b>{question_num}.</b> {q_text}{meta}",
                styles['ChineseQuestion']
            ))

            # Options (if any)
            options = q.get('options')
            if options and isinstance(options, list):
                for opt in options:
                    story.append(Paragraph(str(opt), styles['ChineseOption']))

            # Answer space (if no answers included)
            if not include_answers:
                story.append(Spacer(1, 15*mm))
                story.append(HRFlowable(width="80%", thickness=0.3, color=colors.HexColor('#CCCCCC')))
                story.append(Spacer(1, 3*mm))
            else:
                # Answer
                answer = q.get('answer', '')
                story.append(Paragraph(
                    f"<b>参考答案:</b> {answer}",
                    styles['ChineseAnswer']
                ))

                # Solution
                solution = q.get('solution', '')
                if solution:
                    story.append(Paragraph(
                        f"<b>解题思路:</b> {solution}",
                        styles['ChineseSolution']
                    ))

            story.append(Spacer(1, 2*mm))

    # === Study Suggestions ===
    suggestions = practice_data.get('study_suggestions', '')
    if suggestions:
        story.append(Spacer(1, 6*mm))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E5E7EB')))
        story.append(Spacer(1, 4*mm))
        story.append(Paragraph("📖 学习建议", styles['ChineseHeading']))
        story.append(Paragraph(suggestions, styles['ChineseBody']))

    # === Footer ===
    story.append(Spacer(1, 10*mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#E5E7EB')))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        f"以上练习题及解析内容由 AI 生成，基于国产大模型，仅供教学参考",
        styles['ChineseFooter']
    ))
    story.append(Paragraph(
        f"由教育智能体自动生成 | {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        styles['ChineseFooter']
    ))

    # Build PDF
    doc.build(story)
    return filepath


def generate_error_report_pdf(student_name: str, errors: list, stats: dict) -> str:
    """生成错题报告 PDF"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = student_name.replace(' ', '_')
    filename = f"error_report_{safe_name}_{timestamp}.pdf"
    filepath = os.path.join(EXPORTS_DIR, filename)

    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=20*mm,
        bottomMargin=20*mm
    )

    styles = get_chinese_styles()
    story = []

    # Title
    story.append(Paragraph(f"{student_name} 错题分析报告", styles['ChineseTitle']))
    story.append(Paragraph(
        f"生成日期: {datetime.now().strftime('%Y年%m月%d日')}  共 {len(errors)} 道错题",
        styles['ChineseSubtitle']
    ))
    story.append(Spacer(1, 6*mm))

    # Stats summary
    by_kp = stats.get('by_knowledge_point', [])
    if by_kp:
        story.append(Paragraph("薄弱知识点分布", styles['ChineseHeading']))
        for item in by_kp[:10]:
            bar_width = min(item['count'] * 4, 40)
            bar = "█" * bar_width
            story.append(Paragraph(
                f"{item['knowledge_point']}: {bar} ({item['count']}次)",
                styles['ChineseBody']
            ))
        story.append(Spacer(1, 4*mm))

    # Error list
    story.append(Paragraph("错题详情", styles['ChineseHeading']))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#E5E7EB')))

    for i, err in enumerate(errors, 1):
        story.append(Spacer(1, 3*mm))
        story.append(Paragraph(
            f"<b>错题 {i}</b>  [知识点: {err.get('knowledge_point', '未知')}  "
            f"错误类型: {err.get('error_type', '未知')}  难度: {err.get('difficulty', 3)}/5]",
            styles['ChineseQuestion']
        ))
        story.append(Paragraph(f"题目: {err.get('question_text', '')}", styles['ChineseBody']))
        story.append(Paragraph(f"学生答案: {err.get('student_answer', '')}", styles['ChineseAnswer']))
        story.append(Paragraph(f"正确答案: {err.get('correct_answer', '')}", styles['ChineseAnswer']))
        if err.get('analysis'):
            story.append(Paragraph(f"分析: {err.get('analysis', '')}", styles['ChineseSolution']))
        story.append(HRFlowable(width="100%", thickness=0.3, color=colors.HexColor('#EEEEEE')))

    # Footer
    story.append(Spacer(1, 10*mm))
    story.append(Paragraph(
        f"以上错题分析内容由 AI 生成，基于国产大模型，仅供教学参考",
        styles['ChineseFooter']
    ))
    story.append(Paragraph(
        f"由教育智能体自动生成 | {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        styles['ChineseFooter']
    ))

    doc.build(story)
    return filepath
