"""
教育智能体 - 主应用入口
FastAPI 后端服务
"""
import os
import json
import uuid
import shutil
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import database as db
from llm_service import llm_service, LLMService
from pdf_service import generate_practice_pdf, generate_error_report_pdf
from file_parser import parse_files, ParseResult

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
EXPORT_DIR = os.path.join(os.path.dirname(__file__), "exports")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    await db.init_db()
    # Load saved config
    config = await db.get_config()
    if config and config.get('endpoint') and config.get('api_key'):
        llm_service.configure(config['endpoint'], config['api_key'], config['model_name'])
    yield


app = FastAPI(
    title="教育智能体 - 智能作业批改与分层练习系统",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== API Config ====================

@app.get("/api/config")
async def get_config():
    """获取 API 配置"""
    config = await db.get_config()
    # Mask API key
    if config and config.get('api_key'):
        key = config['api_key']
        if len(key) > 8:
            config['api_key_masked'] = key[:4] + '*' * (len(key) - 8) + key[-4:]
        else:
            config['api_key_masked'] = '****'
        config['api_key'] = key  # Still return full key for form pre-fill
    config['is_configured'] = bool(config.get('endpoint') and config.get('api_key'))
    return config


@app.post("/api/config")
async def save_config(data: dict):
    """保存 API 配置"""
    endpoint = data.get('endpoint', '').strip().rstrip('/')
    api_key = data.get('api_key', '').strip()
    model_name = data.get('model_name', '').strip()

    if not endpoint or not api_key or not model_name:
        raise HTTPException(400, "请填写完整的配置信息")

    await db.save_config(endpoint, api_key, model_name)
    llm_service.configure(endpoint, api_key, model_name)
    return {"success": True, "message": "配置保存成功"}


@app.post("/api/config/test")
async def test_config():
    """测试 API 连接"""
    result = await llm_service.test_connection()
    return result


@app.post("/api/config/normalize-url")
async def normalize_url(data: dict):
    """
    标准化 API URL
    - 去除尾部 /
    - 如果不以 /v1 结尾，自动追加 /v1
    """
    url = data.get('url', '').strip()
    if not url:
        raise HTTPException(400, "请输入 URL")

    tips = ""

    # 去除尾部斜杠
    original_url = url
    url = url.rstrip('/')

    if url != original_url:
        tips += "已自动去除尾部斜杠。"

    # 检查是否以 /v1 结尾
    if not url.endswith('/v1'):
        url = url + '/v1'
        tips += " 已自动追加 /v1 路径。"
    else:
        tips += " URL 已包含 /v1 路径，无需修改。"

    tips = tips.strip()

    return {"url": url, "tips": tips}


@app.post("/api/config/validate-key")
async def validate_api_key(data: dict):
    """验证 API Key 是否有效"""
    endpoint = data.get('endpoint', '').strip().rstrip('/')
    api_key = data.get('api_key', '').strip()

    if not endpoint or not api_key:
        raise HTTPException(400, "请提供 endpoint 和 api_key")

    result = await LLMService.validate_key(endpoint, api_key)
    return result


@app.post("/api/config/models")
async def list_models(data: dict):
    """获取可用模型列表"""
    endpoint = data.get('endpoint', '').strip().rstrip('/')
    api_key = data.get('api_key', '').strip()

    if not endpoint or not api_key:
        raise HTTPException(400, "请提供 endpoint 和 api_key")

    try:
        models = await LLMService.list_models(endpoint, api_key)
        return {"models": models, "message": f"成功获取 {len(models)} 个模型"}
    except RuntimeError as e:
        return {"models": [], "message": str(e)}
    except Exception as e:
        return {"models": [], "message": f"获取模型列表失败: {str(e)}"}


# ==================== Students ====================

@app.get("/api/students")
async def list_students():
    """获取学生列表"""
    students = await db.get_students()
    return {"students": students}


@app.post("/api/students")
async def create_student(data: dict):
    """创建学生"""
    name = data.get('name', '').strip()
    grade = data.get('grade', '').strip()
    class_name = data.get('class_name', '').strip()
    subject = data.get('subject', '数学').strip()

    if not name:
        raise HTTPException(400, "请填写学生姓名")

    student_id = await db.create_student(name, grade, class_name, subject)
    return {"success": True, "id": student_id, "message": f"学生 {name} 添加成功"}


@app.put("/api/students/{student_id}")
async def update_student(student_id: int, data: dict):
    """更新学生信息"""
    name = data.get('name', '').strip()
    grade = data.get('grade', '').strip()
    class_name = data.get('class_name', '').strip()
    subject = data.get('subject', '数学').strip()

    if not name:
        raise HTTPException(400, "请填写学生姓名")

    await db.update_student(student_id, name, grade, class_name, subject)
    return {"success": True, "message": "更新成功"}


@app.delete("/api/students/{student_id}")
async def delete_student(student_id: int):
    """删除学生"""
    await db.delete_student(student_id)
    return {"success": True, "message": "删除成功"}


@app.get("/api/students/{student_id}")
async def get_student(student_id: int):
    """获取学生详情"""
    student = await db.get_student(student_id)
    if not student:
        raise HTTPException(404, "学生不存在")
    return student


# ==================== Homework Grading ====================

@app.post("/api/homework/upload")
async def upload_homework(
    files: list[UploadFile] = File(...),
    student_id: int = Form(...),
    subject: str = Form(default="数学")
):
    """上传作业文件（支持图片、PDF、Word、纯文本）"""
    saved_paths = []
    for file in files:
        ext = file.filename.rsplit('.', 1)[-1] if '.' in file.filename else 'jpg'
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = os.path.join(UPLOAD_DIR, filename)

        with open(filepath, "wb") as f:
            content = await file.read()
            f.write(content)

        saved_paths.append(filepath)

    # 解析文件
    try:
        parse_result: ParseResult = parse_files(saved_paths)
    except Exception as e:
        raise HTTPException(400, f"文件解析失败: {str(e)}")

    # 使用 create_homework_v2 保存，包含 file_type 和 content_text
    # 如果是视觉模式，image_paths 存解析后的图片路径（可能是 PDF 导出的图片）
    if parse_result.mode == "vision" and parse_result.images:
        store_paths = parse_result.images
    else:
        store_paths = saved_paths

    homework_id = await db.create_homework_v2(
        student_id=student_id,
        subject=subject,
        file_paths=store_paths,
        file_type=parse_result.file_type,
        content_text=parse_result.text
    )

    return {
        "success": True,
        "homework_id": homework_id,
        "image_count": len(saved_paths),
        "message": f"成功上传 {len(saved_paths)} 个文件",
        "parse_result": {
            "mode": parse_result.mode,
            "file_type": parse_result.file_type,
            "page_count": parse_result.page_count,
            "image_count": len(parse_result.images),
            "text_length": len(parse_result.text)
        }
    }


@app.get("/api/homework/grade/{homework_id}")
async def grade_homework(homework_id: int):
    """批改作业 - SSE 流式返回（支持视觉模式和文本模式）"""
    homework = await db.get_homework(homework_id)
    if not homework:
        raise HTTPException(404, "作业不存在")

    student = await db.get_student(homework['student_id'])
    subject = homework.get('subject', '数学')

    # 判断批改模式
    file_type = homework.get('file_type', 'image')
    content_text = homework.get('content_text', '')

    # 决定走 vision 还是 text 路径
    use_text_mode = False
    if file_type in ('pdf_text', 'docx', 'text') and content_text:
        use_text_mode = True

    if not use_text_mode:
        image_paths = json.loads(homework['image_paths'])
        if not image_paths:
            raise HTTPException(400, "没有可批改的内容")

    async def event_stream():
        full_result = None
        thinking_steps = []

        # 选择批改方式
        if use_text_mode:
            grading_stream = llm_service.grade_homework_text(content_text, subject)
        else:
            grading_stream = llm_service.grade_homework(image_paths, subject)

        async for event in grading_stream:
            event_type = event['type']
            data = event['data']

            if event_type == 'thinking':
                thinking_steps.append(data)
                yield f"data: {json.dumps({'type': 'thinking', 'data': data}, ensure_ascii=False)}\n\n"

            elif event_type == 'content':
                yield f"data: {json.dumps({'type': 'content', 'data': data}, ensure_ascii=False)}\n\n"

            elif event_type == 'result':
                full_result = data
                yield f"data: {json.dumps({'type': 'result', 'data': data}, ensure_ascii=False)}\n\n"

            elif event_type == 'error':
                yield f"data: {json.dumps({'type': 'error', 'data': data}, ensure_ascii=False)}\n\n"

        # Save results to database
        if full_result:
            # Step: 错题入库
            yield f"data: {json.dumps({'type': 'thinking', 'data': {'step': 'save', 'message': '💾 正在保存批改结果和错题记录...', 'status': 'active'}}, ensure_ascii=False)}\n\n"

            try:
                score = full_result.get('score', 0)
                total_q = full_result.get('total_questions', 0)
                correct_c = full_result.get('correct_count', 0)

                await db.update_homework_result(
                    homework_id,
                    json.dumps(full_result, ensure_ascii=False),
                    json.dumps(thinking_steps, ensure_ascii=False),
                    score, total_q, correct_c
                )

                # Save error records
                errors = []
                for q in full_result.get('questions', []):
                    if not q.get('is_correct', True):
                        errors.append({
                            'question_num': q.get('question_num', 0),
                            'question_text': q.get('question_text', ''),
                            'error_type': q.get('error_type', ''),
                            'knowledge_point': q.get('knowledge_point', ''),
                            'student_answer': q.get('student_answer', ''),
                            'correct_answer': q.get('correct_answer', ''),
                            'analysis': q.get('analysis', ''),
                            'difficulty': q.get('difficulty', 3)
                        })

                if errors:
                    await db.create_error_records(homework['student_id'], homework_id, errors)

                yield f"data: {json.dumps({'type': 'thinking', 'data': {'step': 'save', 'message': f'💾 已保存 {len(errors)} 条错题记录', 'status': 'done'}}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'data': {'homework_id': homework_id, 'score': score, 'errors_saved': len(errors)}}, ensure_ascii=False)}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'thinking', 'data': {'step': 'save', 'message': '💾 保存失败', 'status': 'done'}}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'error', 'data': f'保存结果失败: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.get("/api/homework")
async def list_homework(student_id: Optional[int] = Query(None)):
    """获取作业列表"""
    homeworks = await db.get_homework_list(student_id)
    return {"homeworks": homeworks}


@app.delete("/api/homework/{homework_id}")
async def delete_homework(homework_id: int):
    """删除作业记录及其关联的错题"""
    homework = await db.get_homework(homework_id)
    if not homework:
        raise HTTPException(404, "作业不存在")
    await db.delete_homework(homework_id)
    return {"success": True, "message": "删除成功"}


@app.get("/api/homework/{homework_id}")
async def get_homework_detail(homework_id: int):
    """获取作业详情"""
    homework = await db.get_homework(homework_id)
    if not homework:
        raise HTTPException(404, "作业不存在")

    # Parse JSON fields
    if homework.get('grading_result'):
        try:
            homework['grading_result'] = json.loads(homework['grading_result'])
        except:
            pass

    if homework.get('thinking_chain'):
        try:
            homework['thinking_chain'] = json.loads(homework['thinking_chain'])
        except:
            pass

    if homework.get('image_paths'):
        try:
            homework['image_paths'] = json.loads(homework['image_paths'])
        except:
            pass

    return homework


# ==================== Error Analysis ====================

@app.get("/api/students/{student_id}/errors")
async def get_student_errors(student_id: int):
    """获取学生错题记录"""
    errors = await db.get_error_records(student_id)
    stats = await db.get_error_stats(student_id)
    return {"errors": errors, "stats": stats}


# ==================== Practice Generation ====================

@app.post("/api/practice/generate")
async def generate_practice(data: dict):
    """生成练习题 - SSE 流式返回"""
    student_id = data.get('student_id')
    error_ids = data.get('error_ids', [])  # Optional: specific error IDs

    if not student_id:
        raise HTTPException(400, "请选择学生")

    student = await db.get_student(student_id)
    if not student:
        raise HTTPException(404, "学生不存在")

    # Get error records
    errors = await db.get_error_records(student_id)
    if not errors:
        raise HTTPException(400, "该学生暂无错题记录，请先批改作业")

    # Filter by error IDs if provided
    if error_ids:
        errors = [e for e in errors if e['id'] in error_ids]

    # Limit to most recent errors
    errors = errors[:15]

    subject = student.get('subject', '数学')

    # 获取学生数据画像
    try:
        student_profile = await db.get_student_profile(student_id)
    except Exception:
        student_profile = None

    async def event_stream():
        full_result = None

        async for event in llm_service.generate_practice(errors, student['name'], subject, student_profile=student_profile):
            event_type = event['type']
            event_data = event['data']

            if event_type == 'thinking':
                yield f"data: {json.dumps({'type': 'thinking', 'data': event_data}, ensure_ascii=False)}\n\n"
            elif event_type == 'content':
                yield f"data: {json.dumps({'type': 'content', 'data': event_data}, ensure_ascii=False)}\n\n"
            elif event_type == 'result':
                full_result = event_data
                yield f"data: {json.dumps({'type': 'result', 'data': event_data}, ensure_ascii=False)}\n\n"
            elif event_type == 'error':
                yield f"data: {json.dumps({'type': 'error', 'data': event_data}, ensure_ascii=False)}\n\n"

        # Save practice sheet
        if full_result:
            try:
                # Generate PDF
                pdf_path = generate_practice_pdf(full_result, student['name'])

                practice_id = await db.create_practice_sheet(
                    student_id,
                    full_result.get('title', '练习题'),
                    json.dumps(full_result.get('questions', []), ensure_ascii=False),
                    json.dumps(full_result.get('target_knowledge_points', []), ensure_ascii=False),
                    pdf_path
                )

                yield f"data: {json.dumps({'type': 'done', 'data': {'practice_id': practice_id, 'pdf_path': pdf_path}}, ensure_ascii=False)}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'data': f'保存练习题失败: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.get("/api/practice")
async def list_practice(student_id: Optional[int] = Query(None)):
    """获取练习题列表"""
    sheets = await db.get_practice_sheets(student_id)
    return {"practice_sheets": sheets}


@app.get("/api/practice/{practice_id}/pdf")
async def download_practice_pdf(practice_id: int):
    """下载练习题 PDF"""
    database = await db.get_db()
    try:
        cursor = await database.execute(
            "SELECT * FROM practice_sheets WHERE id = ?", (practice_id,)
        )
        sheet = await cursor.fetchone()
        if not sheet:
            raise HTTPException(404, "练习题不存在")

        sheet = dict(sheet)
        pdf_path = sheet.get('pdf_path', '')

        if not pdf_path or not os.path.exists(pdf_path):
            # Regenerate PDF
            questions_data = {
                'title': sheet.get('title', '练习题'),
                'questions': json.loads(sheet.get('questions', '[]')),
                'target_knowledge_points': json.loads(sheet.get('target_knowledge_points', '[]'))
            }
            # Get student name
            student = await db.get_student(sheet['student_id'])
            student_name = student['name'] if student else ''
            pdf_path = generate_practice_pdf(questions_data, student_name)
            await db.update_practice_pdf_path(practice_id, pdf_path)

        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=os.path.basename(pdf_path)
        )
    finally:
        await database.close()


@app.get("/api/students/{student_id}/error-report-pdf")
async def download_error_report(student_id: int):
    """下载错题报告 PDF"""
    student = await db.get_student(student_id)
    if not student:
        raise HTTPException(404, "学生不存在")

    errors = await db.get_error_records(student_id)
    stats = await db.get_error_stats(student_id)

    pdf_path = generate_error_report_pdf(student['name'], errors, stats)

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=os.path.basename(pdf_path)
    )


# ==================== Dashboard ====================

@app.get("/api/stats")
async def get_stats():
    """获取仪表盘统计"""
    stats = await db.get_dashboard_stats()
    return stats


# ==================== Image serving ====================

@app.get("/api/uploads/{filename}")
async def serve_upload(filename: str):
    """提供上传的图片"""
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, "文件不存在")
    return FileResponse(filepath)


# ==================== Health check ====================

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "configured": llm_service.configured}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
