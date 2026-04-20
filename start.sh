#!/bin/bash
# 教育智能体 - 启动脚本
# 同时启动后端 (FastAPI) 和前端 (Vite Dev Server)

echo "========================================="
echo "  🎓 教育智能体 - 智能作业批改系统"
echo "  正在启动服务..."
echo "========================================="

# Get the directory of this script
DIR="$(cd "$(dirname "$0")" && pwd)"

# Start backend
echo ""
echo "📦 启动后端服务 (FastAPI @ http://localhost:8000)..."
cd "$DIR/backend"
python3 -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 2

# Start frontend
echo "🎨 启动前端服务 (Vite @ http://localhost:5173)..."
cd "$DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "========================================="
echo "  ✅ 服务已启动!"
echo "  🌐 前端: http://localhost:5173"
echo "  🔧 后端: http://localhost:8000"
echo "  📚 API文档: http://localhost:8000/docs"
echo ""
echo "  按 Ctrl+C 停止所有服务"
echo "========================================="
echo ""

# Handle shutdown
cleanup() {
    echo ""
    echo "🛑 正在停止服务..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID 2>/dev/null
    wait $FRONTEND_PID 2>/dev/null
    echo "✅ 所有服务已停止"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for either process to exit
wait
