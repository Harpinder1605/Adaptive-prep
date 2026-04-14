import { useState, useEffect } from 'react';

function App() {
  const [user, setUser] = useState(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [authMode, setAuthMode] = useState('landing');
  
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [newTopicInput, setNewTopicInput] = useState('');
  
  const [questions, setQuestions] = useState([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [startTime, setStartTime] = useState(null);

  const [userAnswers, setUserAnswers] = useState([]);
  const [isGeneratingInitial, setIsGeneratingInitial] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState(null);

  // Automatically switch between local testing and your live deployed backend
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = isLocal 
    ? 'http://localhost:5000/api' 
    : 'https://adaptive-prep.onrender.com/api'; 

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!usernameInput.trim() || !passwordInput.trim()) {
      setLoginError('Both username and password are required.');
      return;
    }
    try {
      const endpoint = authMode === 'login' ? '/users/login' : '/users/signup';
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await res.json();
      if (!res.ok) return setLoginError(data.error || 'Authentication failed');
      setUser(data);
      fetchTopics(data.id);
    } catch (err) {
      setLoginError('Could not connect to the server.');
    }
  };

  const fetchTopics = async (activeUserId) => {
    try {
      const currentId = activeUserId || user?.id;
      if (!currentId) return;
      const res = await fetch(`${API_BASE}/topics?userId=${currentId}`);
      const data = await res.json();
      setTopics(data);
    } catch (err) {
      console.error("Failed to fetch topics:", err);
    }
  };

  const handleCreateTopic = async () => {
    if (!newTopicInput.trim() || !user) return;
    try {
      const res = await fetch(`${API_BASE}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTopicInput, userId: user.id })
      });
      const data = await res.json();
      setTopics([data, ...topics]);
      setNewTopicInput('');
    } catch (err) {
      console.error("Failed to create topic", err);
    }
  };

  const handleDeleteTopic = async (topicId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this topic?')) return;
    try {
      const res = await fetch(`${API_BASE}/topics/${topicId}`, { method: 'DELETE' });
      if (res.ok) setTopics(topics.filter(t => t.id !== topicId));
    } catch (err) {
      console.error("Failed to delete topic:", err);
    }
  };

  const startQuiz = async (topic) => {
    setSelectedTopic(topic);
    try {
      const res = await fetch(`${API_BASE}/questions/${topic.id}?userId=${user.id}`);
      let data = await res.json();
      
      if (data.length === 0) {
        setIsGeneratingInitial(true);
        await fetch(`${API_BASE}/generate-initial`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic.name, userId: user.id, topicId: topic.id })
        });
        const res2 = await fetch(`${API_BASE}/questions/${topic.id}?userId=${user.id}`);
        data = await res2.json();
        setIsGeneratingInitial(false);
      }

      setQuestions(data);
      setCurrentQIndex(0);
      setScore(0);
      setUserAnswers([]);
      setQuizFinished(false);
      setAiReport(null);
      setStartTime(Date.now());
    } catch (err) {
      console.error("Failed to fetch questions:", err);
    }
  };

  const fetchAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      });
      const data = await res.json();
      setAiReport(data);
    } catch (err) {
      setAiReport({ error: true, analysis: "AI analysis unavailable." });
    }
    setIsAnalyzing(false);
  };

  const handleAnswer = async (selectedOption) => {
    const currentQuestion = questions[currentQIndex];
    const isCorrect = selectedOption === currentQuestion.correct_answer;
    const timeTaken = Math.round((Date.now() - startTime) / 1000);

    if (isCorrect) setScore(score + 1);
    setUserAnswers(prev => [...prev, { question: currentQuestion, selected: selectedOption, isCorrect }]);

    try {
      await fetch(`${API_BASE}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, question_id: currentQuestion.id, is_correct: isCorrect, time_taken_seconds: timeTaken })
      });
    } catch (err) {}

    if (currentQIndex + 1 < questions.length) {
      setCurrentQIndex(currentQIndex + 1);
      setStartTime(Date.now());
    } else {
      setQuizFinished(true);
      fetchAiAnalysis();
    }
  };

  const resetDashboard = () => {
    setSelectedTopic(null);
    setQuestions([]);
    setAiReport(null);
    setUserAnswers([]);
    fetchTopics();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="bg-blue-600 p-4 rounded-full mb-4 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">Adaptive Prep</h1>
          <p className="text-lg text-gray-500 italic">"Master any subject, one adaptive step at a time."</p>
        </div>

        {authMode === 'landing' ? (
          <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{getGreeting()}!</h2>
            <p className="text-gray-600 mb-8">Please log in or create an account to continue.</p>
            <div className="flex flex-col gap-4">
              <button onClick={() => setAuthMode('login')} className="bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition">Log In</button>
              <button onClick={() => setAuthMode('signup')} className="bg-white text-blue-600 border-2 border-blue-600 font-semibold py-3 rounded-lg hover:bg-blue-50 transition">Sign Up</button>
            </div>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md relative">
            <button onClick={() => setAuthMode('landing')} className="absolute top-6 left-6 text-gray-400 hover:text-gray-600 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center mt-2">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              {loginError && <div className="bg-red-100 text-red-700 p-3 rounded text-sm mb-2">{loginError}</div>}
              <input type="text" placeholder="Username" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"/>
              <input type="password" placeholder="Password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"/>
              <button type="submit" className="bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition mt-2">{authMode === 'login' ? 'Log In' : 'Sign Up'}</button>
            </form>
          </div>
        )}
      </div>
    );
  }

  if (selectedTopic && isGeneratingInitial) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
         <div className="text-center bg-white p-12 rounded-xl shadow-lg max-w-md w-full">
             <span className="text-6xl block mb-6 animate-pulse">✨</span>
             <h2 className="text-2xl font-bold text-gray-800 mb-2">Generating Questions...</h2>
             <p className="text-gray-500"> We are generating questions for <span className="font-bold text-blue-600">{selectedTopic.name}</span>.</p>
         </div>
      </div>
    );
  }

  if (!selectedTopic) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-12">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-full shadow-md"><svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg></div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Adaptive Prep</h1>
            </div>
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-gray-800">Hi, {user.username}!</h2>
              <button onClick={() => setUser(null)} className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-1 px-3 rounded transition">Log Out</button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-100">
             <h3 className="text-lg font-bold text-gray-800 mb-3">Study a New Topic</h3>
             <div className="flex flex-col sm:flex-row gap-3">
                <input value={newTopicInput} onChange={(e) => setNewTopicInput(e.target.value)} placeholder="e.g. React Hooks, World History..." className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"/>
                <button onClick={handleCreateTopic} className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg transition shadow-sm w-full sm:w-auto">Generate</button>
             </div>
          </div>
          
          <h3 className="text-xl font-semibold text-gray-600 mb-4">Your Topics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topics.map(topic => (
              <div key={topic.id} onClick={() => startQuiz(topic)} className="bg-white p-6 rounded-xl shadow-sm cursor-pointer hover:shadow-md hover:border-blue-500 border-2 border-transparent transition relative group">
                <div className="flex justify-between items-start">
                  <h3 className="text-lg font-bold text-gray-800">{topic.name}</h3>
                  <button onClick={(e) => handleDeleteTopic(topic.id, e)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                </div>
                <p className="text-sm text-gray-500 mt-2">Adaptive Learning Active</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (quizFinished) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4">
        <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-lg">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Quiz Complete!</h2>
            <p className="text-xl text-gray-600">Score: <span className="font-bold text-blue-600">{score}</span> / {questions.length}</p>
          </div>

          {isAnalyzing ? (
            <div className="flex flex-col items-center p-8 bg-blue-50 rounded-xl animate-pulse mb-8 border border-blue-100">
              <span className="text-5xl mb-4">🧠</span>
              <p className="text-blue-800 font-bold">AI is analyzing performance...</p>
            </div>
          ) : aiReport && (
            <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 mb-8">
               <h3 className="text-xl font-bold text-indigo-900 mb-4 flex items-center gap-2">📊 AI Tutor Report</h3>
               <div className="space-y-3 text-sm">
                 <p className="bg-white p-4 rounded border-l-4 border-blue-500"><strong>Analysis:</strong> {aiReport.analysis}</p>
                 <p className="bg-white p-4 rounded border-l-4 border-red-400"><strong>Weak Points:</strong> {aiReport?.weak_points?.join(', ') || 'None'}</p>
                 <p className="bg-white p-4 rounded border-l-4 border-green-500"><strong>Recommendation:</strong> {aiReport.recommended_next_step}</p>
                 <div className="bg-indigo-600 text-white p-4 rounded text-center font-bold mt-4 shadow-md">
                   Difficulty: {aiReport.new_difficulty}
                 </div>
               </div>
            </div>
          )}

          <div className="border-t pt-8 mb-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Review Answers</h3>
            <div className="space-y-6">
              {userAnswers.map((ans, idx) => (
                <div key={idx} className={`p-5 rounded-lg border-l-4 ${ans.isCorrect ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
                  <p className="font-bold text-gray-800 mb-2">{idx + 1}. {ans.question.question_text}</p>
                  <p className={`text-sm font-medium ${ans.isCorrect ? 'text-green-700' : 'text-red-700'}`}>Your: {ans.selected}</p>
                  {!ans.isCorrect && <p className="text-sm font-medium text-green-700">Correct: {ans.question.correct_answer}</p>}
                  {ans.question.explanation && <p className="mt-3 text-xs italic text-gray-600">AI Note: {ans.question.explanation}</p>}
                </div>
              ))}
            </div>
          </div>
          <button onClick={resetDashboard} className="bg-blue-600 text-white font-bold py-4 rounded-lg hover:bg-blue-700 transition w-full shadow-lg">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-2xl">
        <div className="flex justify-between mb-6">
          <span className="text-xs font-bold text-blue-600 bg-blue-100 px-3 py-1 rounded-full uppercase tracking-wider">Question {currentQIndex + 1} / {questions.length}</span>
          <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Level {questions[currentQIndex]?.difficulty_level}</span>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-8">{questions[currentQIndex]?.question_text}</h2>
        <div className="flex flex-col gap-3">
          {questions[currentQIndex]?.options.map((option, idx) => (
            <button key={idx} onClick={() => handleAnswer(option)} className="text-left w-full p-4 border rounded-lg hover:bg-blue-50 hover:border-blue-500 transition text-gray-700 font-medium">{option}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;