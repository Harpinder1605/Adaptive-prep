🧠 Adaptive Prep

"Master any subject, one adaptive step at a time."

Adaptive Prep is a full-stack learning platform that uses Artificial Intelligence to personalize your study experience. It generates custom quizzes on any topic you choose and uses an adaptive engine to adjust difficulty based on your performance, providing detailed AI-generated reports to help you improve.

🚀 Live Demo

Frontend: [https://adaptive-prep.vercel.app/]

Backend: [https://adaptive-prep.onrender.com/api/health]

[!IMPORTANT]
Note on Performance: The backend server is hosted on Render's free tier. If the app has been inactive for a while, the server will "spin down" (go to sleep). Please allow 40-60 seconds for the server to "wake up" when you first try to log in or interact with the app.

✨ Key Features

AI Topic Generation: Create a quiz for literally any subject (e.g., "Quantum Physics," "React Hooks," or "World History").

Adaptive Difficulty: Our ML engine analyzes your accuracy and speed to increase or decrease the difficulty of the next set of questions.

Secure Authentication: User accounts with hashed passwords using bcrypt.

Smart Fallback: If the AI analyzer hits a rate limit, the system automatically resumes from your highest achieved difficulty level.

Review Mode: After every quiz, see which questions you got wrong and read AI-generated explanations for the correct answers.

Mobile Responsive: Fully optimized for study sessions on your phone or tablet.

🛠️ Tech Stack

Frontend: React.js, Tailwind CSS, Vite.

Backend: Node.js, Express.js.

ML/AI Engine: Python 3, Groq API (LLaMA 3).

Database: PostgreSQL (Hosted on Neon).

DevOps: Docker (to bundle Node & Python together), Render (Backend), Vercel (Frontend).

⚙️ Local Setup

1. Prerequisites

Node.js (v18+)

Python 3.x

PostgreSQL database (or a Neon.tech account)

Groq API Key

2. Installation

Clone the repository:

git clone https://github.com/Harpinder1605/adaptive-prep.git
cd adaptive-prep


3. Backend Setup

cd backend
npm install
# Create a .env file with DATABASE_URL and GROQ_API_KEY
npm run dev


4. ML Engine Setup

cd ../ml_engine
pip install -r requirements.txt
# Create a .env file with DATABASE_URL and GROQ_API_KEY


5. Frontend Setup

cd ../frontend
npm install
npm run dev


🔒 Security Measures

Password Hashing: All user passwords are encrypted using salt-rounds with bcrypt.

SQL Injection Protection: All database interactions use parameterized queries to prevent malicious code execution.

Environment Protection: Critical API keys and database credentials are kept out of version control via .gitignore.

📄 License

This project is for educational purposes. Feel free to use and modify it for your own learning!