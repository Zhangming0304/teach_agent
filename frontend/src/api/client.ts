import type {
  ApiConfig,
  Student,
  HomeworkSubmission,
  ErrorRecord,
  ErrorStats,
  PracticeSheet,
  DashboardStats,
} from '../types';

// Base URL is empty — Vite dev server proxy forwards /api to the backend.
const BASE = '';

// ============================================================
// Helpers
// ============================================================

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.detail ?? body?.message ?? res.statusText;
    throw new Error(`API ${res.status}: ${message}`);
  }

  return res.json() as Promise<T>;
}

/** POST helper – JSON body */
async function post<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
}

/** PUT helper – JSON body */
async function put<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
}

/** DELETE helper */
async function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

// ============================================================
// API Configuration
// ============================================================

export async function fetchConfig(): Promise<ApiConfig> {
  return request<ApiConfig>('/api/config');
}

export async function saveConfig(
  data: Partial<Pick<ApiConfig, 'endpoint' | 'api_key' | 'model_name'>>,
): Promise<{ success: boolean; message: string }> {
  return post('/api/config', data);
}

export async function testConfig(): Promise<{ success: boolean; message: string }> {
  return post('/api/config/test');
}

export async function normalizeUrl(
  url: string,
): Promise<{ url: string; tips: string }> {
  return post('/api/config/normalize-url', { url });
}

export async function validateKey(
  endpoint: string,
  apiKey: string,
): Promise<{ valid: boolean; message: string }> {
  return post('/api/config/validate-key', { endpoint, api_key: apiKey });
}

export async function fetchModels(
  endpoint: string,
  apiKey: string,
): Promise<{ models: { id: string; name?: string }[]; message: string }> {
  return post('/api/config/models', { endpoint, api_key: apiKey });
}

// ============================================================
// Students
// ============================================================

export async function fetchStudents(): Promise<Student[]> {
  const data = await request<any>('/api/students');
  return data?.students ?? data ?? [];
}

export async function createStudent(
  data: Pick<Student, 'name' | 'grade' | 'class_name' | 'subject'>,
): Promise<{ success: boolean; id: number; message: string }> {
  return post('/api/students', data);
}

export async function updateStudent(
  id: number,
  data: Partial<Pick<Student, 'name' | 'grade' | 'class_name' | 'subject'>>,
): Promise<{ success: boolean; message: string }> {
  return put(`/api/students/${id}`, data);
}

export async function deleteStudent(
  id: number,
): Promise<{ success: boolean; message: string }> {
  return del(`/api/students/${id}`);
}

// ============================================================
// Homework
// ============================================================

/**
 * Upload homework images for a student.
 * `formData` should include the multipart files and a `student_id` field.
 * Content-Type is intentionally omitted so the browser sets the boundary.
 */
export async function uploadHomework(
  formData: FormData,
): Promise<{ success: boolean; homework_id: number; image_count: number; message: string }> {
  const res = await fetch(`${BASE}/api/homework/upload`, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type — browser handles multipart boundary.
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(`API ${res.status}: ${body?.detail ?? res.statusText}`);
  }

  return res.json();
}

/**
 * Returns the SSE endpoint URL for grading a homework submission.
 * Use with `new EventSource(url)` on the caller side.
 */
export function gradeHomeworkUrl(homeworkId: number): string {
  return `${BASE}/api/homework/grade/${homeworkId}`;
}

export async function fetchHomeworkList(
  studentId?: number,
): Promise<HomeworkSubmission[]> {
  const query = studentId !== undefined ? `?student_id=${studentId}` : '';
  const data = await request<any>(`/api/homework${query}`);
  return data?.homeworks ?? data ?? [];
}

export async function fetchHomeworkDetail(
  id: number,
): Promise<HomeworkSubmission> {
  return request<HomeworkSubmission>(`/api/homework/${id}`);
}

export async function deleteHomework(
  id: number,
): Promise<{ success: boolean; message: string }> {
  return del(`/api/homework/${id}`);
}

// ============================================================
// Error Records
// ============================================================

export async function fetchStudentErrors(
  studentId: number,
): Promise<{ errors: ErrorRecord[]; stats: ErrorStats }> {
  return request<{ errors: ErrorRecord[]; stats: ErrorStats }>(
    `/api/students/${studentId}/errors`,
  );
}

// ============================================================
// Practice Sheets
// ============================================================

/**
 * Generate a practice sheet via a POST request that returns an SSE stream.
 * Because `EventSource` only supports GET, we use `fetch` and return the
 * `ReadableStreamDefaultReader` so callers can consume chunks manually.
 *
 * Usage:
 * ```ts
 * const reader = await generatePractice(studentId, [1, 2, 3]);
 * const decoder = new TextDecoder();
 * while (true) {
 *   const { value, done } = await reader.read();
 *   if (done) break;
 *   const text = decoder.decode(value);
 *   // parse SSE lines from `text` …
 * }
 * ```
 */
export async function generatePractice(
  studentId: number,
  errorIds?: number[],
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const res = await fetch(`${BASE}/api/practice/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_id: studentId,
      ...(errorIds !== undefined && { error_ids: errorIds }),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(`API ${res.status}: ${body?.detail ?? res.statusText}`);
  }

  if (!res.body) {
    throw new Error('Response body is not a ReadableStream');
  }

  return res.body.getReader();
}

export async function fetchPracticeList(
  studentId?: number,
): Promise<PracticeSheet[]> {
  const query = studentId !== undefined ? `?student_id=${studentId}` : '';
  const data = await request<any>(`/api/practice${query}`);
  return data?.practice_sheets ?? data ?? [];
}

/**
 * Returns the URL to download a practice sheet PDF.
 */
export function getPracticePdfUrl(practiceId: number): string {
  return `${BASE}/api/practice/${practiceId}/pdf`;
}

// ============================================================
// Reports
// ============================================================

/**
 * Returns the URL to download an error-analysis report PDF for a student.
 */
export function getErrorReportPdfUrl(studentId: number): string {
  return `${BASE}/api/students/${studentId}/error-report-pdf`;
}

// ============================================================
// Dashboard
// ============================================================

export async function fetchStats(): Promise<DashboardStats> {
  return request<DashboardStats>('/api/stats');
}
