"""
LLM 服务模块 - 与 OpenAI 兼容格式的多模态大模型 API 交互
"""
import openai
import base64
import json
import os
import re
from typing import AsyncGenerator


class LLMService:
    """大模型服务 - 支持 OpenAI 兼容格式的 API"""

    def __init__(self):
        self.client = None
        self.model = ""
        self.configured = False

    def configure(self, endpoint: str, api_key: str, model_name: str):
        """配置 LLM API"""
        if not endpoint or not api_key or not model_name:
            self.configured = False
            return

        self.client = openai.AsyncOpenAI(
            base_url=endpoint,
            api_key=api_key
        )
        self.model = model_name
        self.configured = True

    async def test_connection(self) -> dict:
        """测试 API 连接"""
        if not self.configured:
            return {"success": False, "message": "API 未配置"}

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "请回复'连接成功'四个字"}],
                max_tokens=50
            )
            content = response.choices[0].message.content
            return {"success": True, "message": f"连接成功！模型回复: {content}"}
        except Exception as e:
            return {"success": False, "message": f"连接失败: {str(e)}"}

    # ==================== 模型列表 & Key 验证 ====================

    @staticmethod
    async def list_models(endpoint: str, api_key: str) -> list[dict]:
        """
        获取可用模型列表

        Args:
            endpoint: API 端点 URL
            api_key: API 密钥

        Returns:
            模型列表 [{id, name}, ...]
        """
        try:
            client = openai.AsyncOpenAI(base_url=endpoint, api_key=api_key)
            models_response = await client.models.list()
            models = []
            for model in models_response.data:
                models.append({
                    "id": model.id,
                    "name": getattr(model, 'name', model.id)
                })
            # 按 id 排序
            models.sort(key=lambda m: m['id'])
            return models
        except Exception as e:
            raise RuntimeError(f"获取模型列表失败: {str(e)}")

    @staticmethod
    async def validate_key(endpoint: str, api_key: str) -> dict:
        """
        验证 API Key 是否有效（轻量级测试，尝试获取模型列表）

        Args:
            endpoint: API 端点 URL
            api_key: API 密钥

        Returns:
            {"valid": bool, "message": str}
        """
        try:
            client = openai.AsyncOpenAI(base_url=endpoint, api_key=api_key)
            models_response = await client.models.list()
            model_count = len(models_response.data)
            return {
                "valid": True,
                "message": f"API Key 有效，可用模型数: {model_count}"
            }
        except openai.AuthenticationError:
            return {
                "valid": False,
                "message": "API Key 无效，认证失败"
            }
        except openai.PermissionDeniedError:
            return {
                "valid": False,
                "message": "权限不足，请检查 API Key 权限"
            }
        except Exception as e:
            return {
                "valid": False,
                "message": f"验证失败: {str(e)}"
            }

    # ==================== 作业批改 ====================

    def _build_grading_prompt(self, subject: str) -> str:
        """构建批改 prompt 文本"""
        return f"""你是一个专业的{subject}教师，请仔细批改这份学生作业。

请按照以下步骤进行批改：
1. 仔细识别图片中的每一道题目和学生的解答
2. 逐题分析学生的解答过程和结果
3. 判断每道题的对错
4. 对错误的题目给出详细分析，指出错误原因和正确解法

请严格按照以下JSON格式返回批改结果（不要输出任何其他内容，只输出JSON）：
{{
    "total_questions": 题目总数,
    "correct_count": 正确题数,
    "score": 得分(百分制,保留1位小数),
    "questions": [
        {{
            "question_num": 题号,
            "question_text": "题目内容（从图片中识别）",
            "student_answer": "学生的回答",
            "correct_answer": "正确答案",
            "is_correct": true或false,
            "error_type": "错误类型(计算错误/概念错误/粗心大意/方法错误/审题错误/步骤缺失等，正确则填空字符串)",
            "knowledge_point": "涉及的知识点",
            "analysis": "详细分析(如果正确简要说明,如果错误详细分析错因和正确解法)",
            "difficulty": 难度(1-5的整数)
        }}
    ],
    "overall_comment": "总体评语(鼓励性语言,指出优点和改进方向)",
    "weak_points": ["薄弱知识点1", "薄弱知识点2"]
}}"""

    def _parse_json_response(self, full_response: str) -> dict:
        """从 LLM 响应中提取 JSON 结果"""
        json_str = full_response.strip()

        # 处理 markdown 代码块
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0].strip()
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0].strip()

        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            # 尝试用正则提取 JSON
            json_match = re.search(r'\{[\s\S]*\}', full_response)
            if json_match:
                return json.loads(json_match.group())
            raise

    async def grade_homework(self, image_paths: list[str], subject: str = "数学") -> AsyncGenerator[dict, None]:
        """
        批改作业（视觉模式）- 流式返回思维链和结果
        yields: {"type": "thinking"|"content"|"result"|"error", "data": ...}
        """
        if not self.configured:
            yield {"type": "error", "data": "LLM API 未配置，请先在设置页面配置 API"}
            return

        # Step 1: 文件接收
        yield {"type": "thinking", "data": {
            "step": "receive",
            "message": f"📥 接收到 {len(image_paths)} 个文件，类型: 图片",
            "status": "done"
        }}

        # Step 2: 文件解析
        yield {"type": "thinking", "data": {
            "step": "parse",
            "message": f"📄 文件解析完成，共 {len(image_paths)} 张图片，走视觉识别路径",
            "status": "done"
        }}

        # Step 3: 内容识别
        yield {"type": "thinking", "data": {
            "step": "recognize",
            "message": "🔍 AI 正在识别题目...",
            "status": "active"
        }}

        # Build multimodal message
        content = []
        content.append({
            "type": "text",
            "text": self._build_grading_prompt(subject)
        })

        # Add images
        for img_path in image_paths:
            try:
                with open(img_path, "rb") as f:
                    img_data = base64.b64encode(f.read()).decode()

                ext = img_path.lower().rsplit('.', 1)[-1] if '.' in img_path else 'jpeg'
                mime_map = {
                    'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                    'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp'
                }
                mime_type = mime_map.get(ext, 'image/jpeg')

                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{img_data}"
                    }
                })
            except Exception as e:
                yield {"type": "error", "data": f"读取图片失败 {img_path}: {str(e)}"}
                return

        # Call LLM
        try:
            full_response = ""
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": content}],
                stream=True,
                max_tokens=8192
            )

            yielded_grading = False
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    text = chunk.choices[0].delta.content
                    full_response += text
                    yield {"type": "content", "data": text}

                    # Update thinking status based on content
                    if not yielded_grading and '"questions"' in full_response:
                        yield {"type": "thinking", "data": {
                            "step": "recognize",
                            "message": "🔍 题目识别完成",
                            "status": "done"
                        }}
                        yield {"type": "thinking", "data": {
                            "step": "grading",
                            "message": "📝 逐题批改中...",
                            "status": "active"
                        }}
                        yielded_grading = True

            yield {"type": "thinking", "data": {
                "step": "grading",
                "message": "📝 批改完成",
                "status": "done"
            }}

            # Step: 错误分析
            yield {"type": "thinking", "data": {
                "step": "analyze",
                "message": "🧠 分析错误类型和知识点...",
                "status": "active"
            }}

            # Step: 生成报告
            yield {"type": "thinking", "data": {
                "step": "report",
                "message": "📊 正在生成批改报告...",
                "status": "active"
            }}

            # Parse result
            try:
                result = self._parse_json_response(full_response)
                yield {"type": "thinking", "data": {
                    "step": "analyze",
                    "message": "🧠 错误分析完成",
                    "status": "done"
                }}
                yield {"type": "thinking", "data": {
                    "step": "report",
                    "message": "📊 批改报告生成完成",
                    "status": "done"
                }}
                yield {"type": "result", "data": result}
            except (json.JSONDecodeError, Exception):
                yield {"type": "error", "data": f"无法解析批改结果，原始回复：{full_response[:500]}"}

        except Exception as e:
            yield {"type": "error", "data": f"调用 LLM API 失败: {str(e)}"}

    async def grade_homework_text(self, text: str, subject: str = "数学") -> AsyncGenerator[dict, None]:
        """
        批改作业（文本模式）- 流式返回思维链和结果
        将文本内容作为 prompt 的一部分发送给 LLM，使用同样的 JSON 输出格式

        Args:
            text: 作业的文本内容
            subject: 学科名称

        yields: {"type": "thinking"|"content"|"result"|"error", "data": ...}
        """
        if not self.configured:
            yield {"type": "error", "data": "LLM API 未配置，请先在设置页面配置 API"}
            return

        # Step 1: 文件接收
        yield {"type": "thinking", "data": {
            "step": "receive",
            "message": f"📥 接收到文本内容，共 {len(text)} 字",
            "status": "done"
        }}

        # Step 2: 文件解析
        yield {"type": "thinking", "data": {
            "step": "parse",
            "message": "📄 文本内容解析完成，走纯文本批改路径",
            "status": "done"
        }}

        # Step 3: 内容识别
        yield {"type": "thinking", "data": {
            "step": "recognize",
            "message": "🔍 AI 正在识别题目...",
            "status": "active"
        }}

        # Build text-only prompt
        prompt = f"""你是一个专业的{subject}教师，请仔细批改这份学生作业。

以下是学生的作业内容：
------
{text}
------

请按照以下步骤进行批改：
1. 仔细识别以上文本中的每一道题目和学生的解答
2. 逐题分析学生的解答过程和结果
3. 判断每道题的对错
4. 对错误的题目给出详细分析，指出错误原因和正确解法

请严格按照以下JSON格式返回批改结果（不要输出任何其他内容，只输出JSON）：
{{
    "total_questions": 题目总数,
    "correct_count": 正确题数,
    "score": 得分(百分制,保留1位小数),
    "questions": [
        {{
            "question_num": 题号,
            "question_text": "题目内容",
            "student_answer": "学生的回答",
            "correct_answer": "正确答案",
            "is_correct": true或false,
            "error_type": "错误类型(计算错误/概念错误/粗心大意/方法错误/审题错误/步骤缺失等，正确则填空字符串)",
            "knowledge_point": "涉及的知识点",
            "analysis": "详细分析(如果正确简要说明,如果错误详细分析错因和正确解法)",
            "difficulty": 难度(1-5的整数)
        }}
    ],
    "overall_comment": "总体评语(鼓励性语言,指出优点和改进方向)",
    "weak_points": ["薄弱知识点1", "薄弱知识点2"]
}}"""

        # Call LLM
        try:
            full_response = ""
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
                max_tokens=8192
            )

            yielded_grading = False
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    text_chunk = chunk.choices[0].delta.content
                    full_response += text_chunk
                    yield {"type": "content", "data": text_chunk}

                    if not yielded_grading and '"questions"' in full_response:
                        yield {"type": "thinking", "data": {
                            "step": "recognize",
                            "message": "🔍 题目识别完成",
                            "status": "done"
                        }}
                        yield {"type": "thinking", "data": {
                            "step": "grading",
                            "message": "📝 逐题批改中...",
                            "status": "active"
                        }}
                        yielded_grading = True

            yield {"type": "thinking", "data": {
                "step": "grading",
                "message": "📝 批改完成",
                "status": "done"
            }}

            yield {"type": "thinking", "data": {
                "step": "analyze",
                "message": "🧠 分析错误类型和知识点...",
                "status": "active"
            }}

            yield {"type": "thinking", "data": {
                "step": "report",
                "message": "📊 正在生成批改报告...",
                "status": "active"
            }}

            # Parse result
            try:
                result = self._parse_json_response(full_response)
                yield {"type": "thinking", "data": {
                    "step": "analyze",
                    "message": "🧠 错误分析完成",
                    "status": "done"
                }}
                yield {"type": "thinking", "data": {
                    "step": "report",
                    "message": "📊 批改报告生成完成",
                    "status": "done"
                }}
                yield {"type": "result", "data": result}
            except (json.JSONDecodeError, Exception):
                yield {"type": "error", "data": f"无法解析批改结果，原始回复：{full_response[:500]}"}

        except Exception as e:
            yield {"type": "error", "data": f"调用 LLM API 失败: {str(e)}"}

    # ==================== 练习题生成 ====================

    async def generate_practice(self, error_records: list, student_name: str,
                                 subject: str = "数学",
                                 student_profile: dict = None) -> AsyncGenerator[dict, None]:
        """
        根据错题生成分层练习 - 流式返回

        Args:
            error_records: 错题记录列表
            student_name: 学生姓名
            subject: 学科
            student_profile: 学生数据画像（来自 db.get_student_profile()）

        yields: {"type": "thinking"|"content"|"result"|"error", "data": ...}
        """
        if not self.configured:
            yield {"type": "error", "data": "LLM API 未配置"}
            return

        yield {"type": "thinking", "data": {"step": "analyze", "message": "📋 正在分析错题记录...", "status": "active"}}

        # Build error summary
        errors_text = ""
        knowledge_points = set()
        for i, err in enumerate(error_records, 1):
            kp = err.get('knowledge_point', '')
            if kp:
                knowledge_points.add(kp)
            errors_text += f"""
错题{i}:
  - 题目: {err.get('question_text', '未知')}
  - 学生答案: {err.get('student_answer', '未知')}
  - 正确答案: {err.get('correct_answer', '未知')}
  - 错误类型: {err.get('error_type', '未知')}
  - 知识点: {kp}
  - 难度: {err.get('difficulty', 3)}/5
"""

        yield {"type": "thinking", "data": {"step": "analyze", "message": f"📋 分析完成，发现 {len(knowledge_points)} 个薄弱知识点", "status": "done"}}
        yield {"type": "thinking", "data": {"step": "design", "message": "🎯 正在设计分层练习题...", "status": "active"}}

        # 构建学生画像注入段
        profile_text = ""
        if student_profile:
            profile_text = "\n## 学生数据画像\n"

            avg_score = student_profile.get('avg_score', 0)
            profile_text += f"- 历史平均分: {avg_score}\n"

            recent_scores = student_profile.get('recent_scores', [])
            if recent_scores:
                scores_str = " → ".join([str(s['score']) for s in recent_scores])
                profile_text += f"- 最近得分趋势: {scores_str}\n"

            kp_dist = student_profile.get('error_knowledge_distribution', [])
            if kp_dist:
                top_kps = kp_dist[:5]
                kp_str = ", ".join([f"{k['knowledge_point']}({k['count']}次)" for k in top_kps])
                profile_text += f"- 高频错误知识点: {kp_str}\n"

            et_dist = student_profile.get('error_type_distribution', [])
            if et_dist:
                et_str = ", ".join([f"{e['error_type']}({e['count']}次)" for e in et_dist])
                profile_text += f"- 错误类型分布: {et_str}\n"

            practice_count = student_profile.get('practice_count', 0)
            profile_text += f"- 已完成练习次数: {practice_count}\n"

            profile_text += "\n请根据以上学生画像，设计更有针对性的个性化题目。对于高频错误知识点要重点加强，根据得分趋势调整题目难度。\n"

        prompt = f"""你是一个经验丰富的{subject}教师，正在为学生"{student_name}"设计个性化分层练习。

## 学生错题分析
{errors_text}

## 薄弱知识点
{', '.join(knowledge_points) if knowledge_points else '待分析'}
{profile_text}
## 出题要求
请严格按照分层教学原则，设计一套针对性练习题：

### 分层设计：
1. **基础巩固层**（2-3道）：针对错题涉及的基本概念，难度低于原题，帮助学生重新理解和掌握基础
2. **能力提升层**（2-3道）：与原题难度相当，变换题目形式，检验学生是否真正掌握
3. **拓展挑战层**（1-2道）：综合多个知识点，难度略高于原题，培养学生综合运用能力

### 每道题要求：
- 题目表述清晰准确
- 提供详细的参考答案
- 提供完整的解题思路和步骤

请严格按照以下JSON格式返回（不要输出其他内容，只输出JSON）：
{{
    "title": "针对{student_name}的{subject}专项练习",
    "description": "本练习针对以下薄弱知识点设计：{', '.join(knowledge_points) if knowledge_points else '综合练习'}",
    "target_knowledge_points": {json.dumps(list(knowledge_points), ensure_ascii=False)},
    "questions": [
        {{
            "id": 1,
            "level": "基础巩固",
            "level_en": "basic",
            "question": "题目内容",
            "options": ["A. xxx", "B. xxx", "C. xxx", "D. xxx"],
            "answer": "参考答案",
            "solution": "详细解题思路和步骤",
            "knowledge_point": "考查知识点",
            "difficulty": 1
        }}
    ],
    "study_suggestions": "学习建议（针对学生的薄弱环节给出具体的学习建议）"
}}

注意：
- options 字段：选择题填写选项数组，非选择题填 null
- difficulty 字段：1-5 的整数
- level 字段只能是"基础巩固"、"能力提升"或"拓展挑战"之一"""

        try:
            full_response = ""
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                stream=True,
                max_tokens=8192
            )

            yielded_generating = False
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    text = chunk.choices[0].delta.content
                    full_response += text
                    yield {"type": "content", "data": text}

                    if not yielded_generating and '"questions"' in full_response:
                        yield {"type": "thinking", "data": {"step": "design", "message": "🎯 题目设计完成", "status": "done"}}
                        yield {"type": "thinking", "data": {"step": "generate", "message": "✍️ 正在生成练习题...", "status": "active"}}
                        yielded_generating = True

            yield {"type": "thinking", "data": {"step": "generate", "message": "✍️ 练习题生成完成", "status": "done"}}

            # Parse result
            try:
                result = self._parse_json_response(full_response)
                yield {"type": "result", "data": result}
            except (json.JSONDecodeError, Exception):
                yield {"type": "error", "data": "无法解析生成结果"}

        except Exception as e:
            yield {"type": "error", "data": f"调用 LLM API 失败: {str(e)}"}


# Global instance
llm_service = LLMService()
