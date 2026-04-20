// ============================================================
// API Configuration
// ============================================================

export interface ApiConfig {
  id: number;
  endpoint: string;
  api_key: string;
  api_key_masked: string;
  model_name: string;
  is_configured: boolean;
}

// ============================================================
// Students
// ============================================================

export interface Student {
  id: number;
  name: string;
  grade: string;
  class_name: string;
  subject: string;
  avatar_color: string;
  created_at: string;
  homework_count: number;
  avg_score: number;
  error_count: number;
}

// ============================================================
// Homework & Grading
// ============================================================

export interface HomeworkSubmission {
  id: number;
  student_id: number;
  student_name: string;
  subject: string;
  image_paths: string[];
  grading_result: GradingResult | string;
  thinking_chain: string;
  score: number;
  total_questions: number;
  correct_count: number;
  status: string;
  created_at: string;
}

export interface GradingResult {
  total_questions: number;
  correct_count: number;
  score: number;
  questions: QuestionResult[];
  overall_comment: string;
  weak_points: string[];
}

export interface QuestionResult {
  question_num: number;
  question_text: string;
  student_answer: string;
  correct_answer: string;
  is_correct: boolean;
  error_type: string;
  knowledge_point: string;
  analysis: string;
  difficulty: string;
}

// ============================================================
// Error Records & Stats
// ============================================================

export interface ErrorRecord {
  id: number;
  student_id: number;
  homework_id: number;
  question_num: number;
  question_text: string;
  error_type: string;
  knowledge_point: string;
  student_answer: string;
  correct_answer: string;
  analysis: string;
  difficulty: string;
  created_at: string;
  subject: string;
  homework_date: string;
}

export interface ErrorStats {
  by_knowledge_point: Array<{ knowledge_point: string; count: number }>;
  by_error_type: Array<{ error_type: string; count: number }>;
  by_difficulty: Array<{ difficulty: string; count: number }>;
}

// ============================================================
// Practice Sheets
// ============================================================

export interface PracticeSheet {
  id: number;
  student_id: number;
  student_name: string;
  title: string;
  questions: string;
  target_knowledge_points: string;
  pdf_path: string;
  created_at: string;
}

export interface PracticeData {
  title: string;
  description: string;
  target_knowledge_points: string[];
  questions: PracticeQuestion[];
  study_suggestions: string;
}

export interface PracticeQuestion {
  id: number;
  level: string;
  level_en: string;
  question: string;
  options: string[] | null;
  answer: string;
  solution: string;
  knowledge_point: string;
  difficulty: string;
}

// ============================================================
// Thinking & Dashboard
// ============================================================

export interface ThinkingStep {
  step: number;
  message: string;
  status: 'active' | 'done';
}

export interface DashboardStats {
  total_students: number;
  total_homeworks: number;
  total_errors: number;
  total_practices: number;
  avg_score: number;
  recent_activities: any[];
}

// ============================================================
// SSE Events
// ============================================================

export interface SSEEvent {
  type: 'thinking' | 'content' | 'result' | 'error' | 'done';
  data: any;
}

// ============================================================
// API Config Helpers
// ============================================================

export interface NormalizeUrlResult {
  url: string;
  tips: string;
}

export interface ValidateKeyResult {
  valid: boolean;
  message: string;
}

export interface ModelInfo {
  id: string;
  name?: string;
}

export interface FetchModelsResult {
  models: ModelInfo[];
  message: string;
}
