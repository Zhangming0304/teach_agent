"""
数据库模块 - SQLite 数据库初始化和操作
"""
import aiosqlite
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "edu_agent.db")


async def init_db():
    """初始化数据库表结构"""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript('''
            CREATE TABLE IF NOT EXISTS api_config (
                id INTEGER PRIMARY KEY,
                endpoint TEXT NOT NULL DEFAULT '',
                api_key TEXT NOT NULL DEFAULT '',
                model_name TEXT NOT NULL DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                grade TEXT NOT NULL DEFAULT '',
                class_name TEXT NOT NULL DEFAULT '',
                subject TEXT NOT NULL DEFAULT '数学',
                avatar_color TEXT NOT NULL DEFAULT '#4F46E5',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS homework_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                subject TEXT NOT NULL DEFAULT '数学',
                image_paths TEXT NOT NULL DEFAULT '[]',
                grading_result TEXT DEFAULT '',
                thinking_chain TEXT DEFAULT '[]',
                score REAL DEFAULT 0,
                total_questions INTEGER DEFAULT 0,
                correct_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS error_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                homework_id INTEGER NOT NULL,
                question_num INTEGER DEFAULT 0,
                question_text TEXT DEFAULT '',
                error_type TEXT DEFAULT '',
                knowledge_point TEXT DEFAULT '',
                student_answer TEXT DEFAULT '',
                correct_answer TEXT DEFAULT '',
                analysis TEXT DEFAULT '',
                difficulty INTEGER DEFAULT 3,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY (homework_id) REFERENCES homework_submissions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS practice_sheets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                title TEXT DEFAULT '',
                questions TEXT DEFAULT '[]',
                target_knowledge_points TEXT DEFAULT '[]',
                difficulty_level TEXT DEFAULT 'adaptive',
                pdf_path TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
            );

            -- Insert default config if not exists
            INSERT OR IGNORE INTO api_config (id, endpoint, api_key, model_name)
            VALUES (1, '', '', '');
        ''')
        await db.commit()

        # 升级 homework_submissions 表：添加新字段（兼容旧数据库）
        try:
            await db.execute(
                "ALTER TABLE homework_submissions ADD COLUMN file_type TEXT DEFAULT 'image'"
            )
            await db.commit()
        except Exception:
            pass  # 列已存在，忽略

        try:
            await db.execute(
                "ALTER TABLE homework_submissions ADD COLUMN content_text TEXT DEFAULT ''"
            )
            await db.commit()
        except Exception:
            pass  # 列已存在，忽略


async def get_db():
    """获取数据库连接"""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db


# ============ API Config Operations ============

async def get_config():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM api_config WHERE id = 1")
        row = await cursor.fetchone()
        if row:
            return dict(row)
        return {"id": 1, "endpoint": "", "api_key": "", "model_name": ""}
    finally:
        await db.close()


async def save_config(endpoint: str, api_key: str, model_name: str):
    db = await get_db()
    try:
        await db.execute(
            """INSERT OR REPLACE INTO api_config (id, endpoint, api_key, model_name, updated_at)
               VALUES (1, ?, ?, ?, ?)""",
            (endpoint, api_key, model_name, datetime.now().isoformat())
        )
        await db.commit()
    finally:
        await db.close()


# ============ Student Operations ============

async def get_students():
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM students ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        students = []
        for row in rows:
            s = dict(row)
            # Get stats
            cursor2 = await db.execute(
                "SELECT COUNT(*) as count, COALESCE(AVG(score), 0) as avg_score FROM homework_submissions WHERE student_id = ?",
                (s['id'],)
            )
            stats = dict(await cursor2.fetchone())
            s['homework_count'] = stats['count']
            s['avg_score'] = round(stats['avg_score'], 1)

            cursor3 = await db.execute(
                "SELECT COUNT(*) as count FROM error_records WHERE student_id = ?",
                (s['id'],)
            )
            err_stats = dict(await cursor3.fetchone())
            s['error_count'] = err_stats['count']
            students.append(s)
        return students
    finally:
        await db.close()


async def create_student(name: str, grade: str, class_name: str, subject: str = "数学"):
    import random
    colors = ['#4F46E5', '#7C3AED', '#EC4899', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#06B6D4', '#3B82F6']
    color = random.choice(colors)
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO students (name, grade, class_name, subject, avatar_color) VALUES (?, ?, ?, ?, ?)",
            (name, grade, class_name, subject, color)
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def update_student(student_id: int, name: str, grade: str, class_name: str, subject: str = "数学"):
    db = await get_db()
    try:
        await db.execute(
            "UPDATE students SET name=?, grade=?, class_name=?, subject=? WHERE id=?",
            (name, grade, class_name, subject, student_id)
        )
        await db.commit()
    finally:
        await db.close()


async def delete_student(student_id: int):
    db = await get_db()
    try:
        await db.execute("DELETE FROM error_records WHERE student_id=?", (student_id,))
        await db.execute("DELETE FROM homework_submissions WHERE student_id=?", (student_id,))
        await db.execute("DELETE FROM practice_sheets WHERE student_id=?", (student_id,))
        await db.execute("DELETE FROM students WHERE id=?", (student_id,))
        await db.commit()
    finally:
        await db.close()


async def get_student(student_id: int):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM students WHERE id = ?", (student_id,))
        row = await cursor.fetchone()
        if row:
            return dict(row)
        return None
    finally:
        await db.close()


# ============ Homework Operations ============

async def delete_homework(homework_id: int):
    """删除作业记录及其关联的错题"""
    db = await get_db()
    try:
        await db.execute("DELETE FROM error_records WHERE homework_id=?", (homework_id,))
        await db.execute("DELETE FROM homework_submissions WHERE id=?", (homework_id,))
        await db.commit()
    finally:
        await db.close()


async def create_homework(student_id: int, subject: str, image_paths: list):
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO homework_submissions (student_id, subject, image_paths, status) VALUES (?, ?, ?, 'pending')",
            (student_id, subject, json.dumps(image_paths))
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def create_homework_v2(student_id: int, subject: str, file_paths: list,
                             file_type: str = "image", content_text: str = ""):
    """创建作业记录 - 支持新字段 file_type 和 content_text"""
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO homework_submissions
               (student_id, subject, image_paths, file_type, content_text, status)
               VALUES (?, ?, ?, ?, ?, 'pending')""",
            (student_id, subject, json.dumps(file_paths), file_type, content_text)
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def update_homework_result(homework_id: int, grading_result: str, thinking_chain: str,
                                  score: float, total_questions: int, correct_count: int):
    db = await get_db()
    try:
        await db.execute(
            """UPDATE homework_submissions
               SET grading_result=?, thinking_chain=?, score=?, total_questions=?, correct_count=?, status='completed'
               WHERE id=?""",
            (grading_result, thinking_chain, score, total_questions, correct_count, homework_id)
        )
        await db.commit()
    finally:
        await db.close()


async def get_homework_list(student_id: int = None):
    db = await get_db()
    try:
        if student_id:
            cursor = await db.execute(
                """SELECT h.*, s.name as student_name
                   FROM homework_submissions h
                   JOIN students s ON h.student_id = s.id
                   WHERE h.student_id = ?
                   ORDER BY h.created_at DESC""",
                (student_id,)
            )
        else:
            cursor = await db.execute(
                """SELECT h.*, s.name as student_name
                   FROM homework_submissions h
                   JOIN students s ON h.student_id = s.id
                   ORDER BY h.created_at DESC"""
            )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def get_homework(homework_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT h.*, s.name as student_name
               FROM homework_submissions h
               JOIN students s ON h.student_id = s.id
               WHERE h.id = ?""",
            (homework_id,)
        )
        row = await cursor.fetchone()
        if row:
            return dict(row)
        return None
    finally:
        await db.close()


# ============ Error Record Operations ============

async def create_error_records(student_id: int, homework_id: int, errors: list):
    db = await get_db()
    try:
        for err in errors:
            await db.execute(
                """INSERT INTO error_records
                   (student_id, homework_id, question_num, question_text, error_type,
                    knowledge_point, student_answer, correct_answer, analysis, difficulty)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (student_id, homework_id, err.get('question_num', 0),
                 err.get('question_text', ''), err.get('error_type', ''),
                 err.get('knowledge_point', ''), err.get('student_answer', ''),
                 err.get('correct_answer', ''), err.get('analysis', ''),
                 err.get('difficulty', 3))
            )
        await db.commit()
    finally:
        await db.close()


async def get_error_records(student_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            """SELECT e.*, h.subject, h.created_at as homework_date
               FROM error_records e
               JOIN homework_submissions h ON e.homework_id = h.id
               WHERE e.student_id = ?
               ORDER BY e.created_at DESC""",
            (student_id,)
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def get_error_stats(student_id: int):
    """获取学生错题统计"""
    db = await get_db()
    try:
        # 按知识点统计
        cursor = await db.execute(
            """SELECT knowledge_point, COUNT(*) as count
               FROM error_records WHERE student_id = ? AND knowledge_point != ''
               GROUP BY knowledge_point ORDER BY count DESC""",
            (student_id,)
        )
        by_knowledge = [dict(row) for row in await cursor.fetchall()]

        # 按错误类型统计
        cursor = await db.execute(
            """SELECT error_type, COUNT(*) as count
               FROM error_records WHERE student_id = ? AND error_type != ''
               GROUP BY error_type ORDER BY count DESC""",
            (student_id,)
        )
        by_error_type = [dict(row) for row in await cursor.fetchall()]

        # 按难度统计
        cursor = await db.execute(
            """SELECT difficulty, COUNT(*) as count
               FROM error_records WHERE student_id = ?
               GROUP BY difficulty ORDER BY difficulty""",
            (student_id,)
        )
        by_difficulty = [dict(row) for row in await cursor.fetchall()]

        return {
            "by_knowledge_point": by_knowledge,
            "by_error_type": by_error_type,
            "by_difficulty": by_difficulty
        }
    finally:
        await db.close()


# ============ Student Profile ============

async def get_student_profile(student_id: int) -> dict:
    """
    获取学生完整数据画像

    Returns:
        {
            "basic_info": {...},
            "total_homeworks": int,
            "avg_score": float,
            "recent_scores": [最近5次得分],
            "error_knowledge_distribution": [{knowledge_point, count}],
            "error_type_distribution": [{error_type, count}],
            "practice_count": int
        }
    """
    db = await get_db()
    try:
        # 基本信息
        cursor = await db.execute("SELECT * FROM students WHERE id = ?", (student_id,))
        student_row = await cursor.fetchone()
        if not student_row:
            return {}
        basic_info = dict(student_row)

        # 总作业数 & 平均分
        cursor = await db.execute(
            """SELECT COUNT(*) as total,
                      COALESCE(AVG(CASE WHEN status='completed' THEN score END), 0) as avg_score
               FROM homework_submissions WHERE student_id = ?""",
            (student_id,)
        )
        hw_stats = dict(await cursor.fetchone())
        total_homeworks = hw_stats['total']
        avg_score = round(hw_stats['avg_score'], 1)

        # 最近5次得分趋势
        cursor = await db.execute(
            """SELECT score, created_at FROM homework_submissions
               WHERE student_id = ? AND status = 'completed'
               ORDER BY created_at DESC LIMIT 5""",
            (student_id,)
        )
        recent_rows = await cursor.fetchall()
        recent_scores = [{"score": dict(r)['score'], "date": dict(r)['created_at']} for r in recent_rows]
        # 反转使其按时间正序（从旧到新）
        recent_scores.reverse()

        # 错题知识点分布（按频次排序）
        cursor = await db.execute(
            """SELECT knowledge_point, COUNT(*) as count
               FROM error_records WHERE student_id = ? AND knowledge_point != ''
               GROUP BY knowledge_point ORDER BY count DESC""",
            (student_id,)
        )
        error_knowledge_distribution = [dict(r) for r in await cursor.fetchall()]

        # 错误类型分布
        cursor = await db.execute(
            """SELECT error_type, COUNT(*) as count
               FROM error_records WHERE student_id = ? AND error_type != ''
               GROUP BY error_type ORDER BY count DESC""",
            (student_id,)
        )
        error_type_distribution = [dict(r) for r in await cursor.fetchall()]

        # 历史练习次数
        cursor = await db.execute(
            "SELECT COUNT(*) as count FROM practice_sheets WHERE student_id = ?",
            (student_id,)
        )
        practice_count = (await cursor.fetchone())['count']

        return {
            "basic_info": basic_info,
            "total_homeworks": total_homeworks,
            "avg_score": avg_score,
            "recent_scores": recent_scores,
            "error_knowledge_distribution": error_knowledge_distribution,
            "error_type_distribution": error_type_distribution,
            "practice_count": practice_count
        }
    finally:
        await db.close()


# ============ Practice Sheet Operations ============

async def create_practice_sheet(student_id: int, title: str, questions: str,
                                 target_knowledge_points: str, pdf_path: str = ""):
    db = await get_db()
    try:
        cursor = await db.execute(
            """INSERT INTO practice_sheets
               (student_id, title, questions, target_knowledge_points, pdf_path)
               VALUES (?, ?, ?, ?, ?)""",
            (student_id, title, questions, target_knowledge_points, pdf_path)
        )
        await db.commit()
        return cursor.lastrowid
    finally:
        await db.close()


async def get_practice_sheets(student_id: int = None):
    db = await get_db()
    try:
        if student_id:
            cursor = await db.execute(
                """SELECT p.*, s.name as student_name
                   FROM practice_sheets p
                   JOIN students s ON p.student_id = s.id
                   WHERE p.student_id = ?
                   ORDER BY p.created_at DESC""",
                (student_id,)
            )
        else:
            cursor = await db.execute(
                """SELECT p.*, s.name as student_name
                   FROM practice_sheets p
                   JOIN students s ON p.student_id = s.id
                   ORDER BY p.created_at DESC"""
            )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def update_practice_pdf_path(practice_id: int, pdf_path: str):
    db = await get_db()
    try:
        await db.execute(
            "UPDATE practice_sheets SET pdf_path = ? WHERE id = ?",
            (pdf_path, practice_id)
        )
        await db.commit()
    finally:
        await db.close()


# ============ Dashboard Stats ============

async def get_dashboard_stats():
    db = await get_db()
    try:
        stats = {}

        cursor = await db.execute("SELECT COUNT(*) as count FROM students")
        stats['total_students'] = (await cursor.fetchone())['count']

        cursor = await db.execute("SELECT COUNT(*) as count FROM homework_submissions")
        stats['total_homeworks'] = (await cursor.fetchone())['count']

        cursor = await db.execute("SELECT COUNT(*) as count FROM error_records")
        stats['total_errors'] = (await cursor.fetchone())['count']

        cursor = await db.execute("SELECT COUNT(*) as count FROM practice_sheets")
        stats['total_practices'] = (await cursor.fetchone())['count']

        cursor = await db.execute(
            "SELECT COALESCE(AVG(score), 0) as avg FROM homework_submissions WHERE status='completed'"
        )
        stats['avg_score'] = round((await cursor.fetchone())['avg'], 1)

        # Recent activities
        cursor = await db.execute(
            """SELECT h.id, h.score, h.status, h.created_at, s.name as student_name, 'homework' as type
               FROM homework_submissions h
               JOIN students s ON h.student_id = s.id
               ORDER BY h.created_at DESC LIMIT 10"""
        )
        stats['recent_activities'] = [dict(row) for row in await cursor.fetchall()]

        return stats
    finally:
        await db.close()
