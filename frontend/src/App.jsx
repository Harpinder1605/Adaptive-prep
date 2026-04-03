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

  // New states for Features
  const [userAnswers, setUserAnswers] = useState([]);
  const [isGeneratingInitial, setIsGeneratingInitial] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState(null);

  // Automatically switch between local testing and your live deployed backend
  // (Removed import.meta to fix the es2015 compilation warning)
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_BASE = isLocal 
    ? 'http://localhost:5000/api' 
    : 'https://adaptive-prep-backend.onrender.com/api'; // <-- IMPORTANT: Replace this with your actual Render URL if it is different!

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
      // Split logic based on whether the user is on the Login or Signup screen
      const endpoint = authMode === 'login' ? '/users/login' : '/users/signup';
      
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await res.json();
      
      if (!res.ok) return setLoginError(data.error || 'Authentication failed');
      
      setUser(data);
      fetchTopics(data.id); // Pass ID directly to load their specific topics
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
        body: JSON.stringify({ name: newTopicInput, userId: user.id }) // Send user ID to backend
      });
      const data = await res.json();
      setTopics([data, ...topics]);
      setNewTopicInput('');
    } catch (err) {
      console.error("Failed to create topic", err);
    }
  };

  const startQuiz = async (topic) => {
    setSelectedTopic(topic);
    try {
      const res = await fetch(`${API_BASE}/questions/${topic.id}?userId=${user.id}`);
      let data = await res.json();
      
      // If no questions exist, trigger the generator automatically!
      if (data.length === 0) {
        setIsGeneratingInitial(true);
        await fetch(`${API_BASE}/generate-initial`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: topic.name })
        });
        
        // Fetch again after generation
        const res2 = await fetch(`${API_BASE}/questions/${topic.id}?userId=${user.id}`);
        data = await res2.json();
        setIsGeneratingInitial(false);
        
        if (data.length === 0) {
          alert("AI failed to generate questions. Please try again.");
          resetDashboard();
          return;
        }
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
      setAiReport({ error: true, analysis: "Could not complete AI analysis at this time." });
    }
    setIsAnalyzing(false);
  };

  const handleAnswer = async (selectedOption) => {
    const currentQuestion = questions[currentQIndex];
    const isCorrect = selectedOption === currentQuestion.correct_answer;
    const timeTaken = Math.round((Date.now() - startTime) / 1000);

    if (isCorrect) setScore(score + 1);

    // Save answer for review
    setUserAnswers(prev => [...prev, {
      question: currentQuestion,
      selected: selectedOption,
      isCorrect: isCorrect
    }]);

    try {
      await fetch(`${API_BASE}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id, question_id: currentQuestion.id, is_correct: isCorrect, time_taken_seconds: timeTaken
        })
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

  // --- RENDER SCREENS ---
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="bg-blue-600 p-4 rounded-full mb-4 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">Adaptive Prep</h1>
          <p className="text-lg text-gray-500 italic">"Master any subject, one adaptive step at a time."</p>
        </div>

        {authMode === 'landing' && (
          <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">{getGreeting()}!</h2>
            <p className="text-gray-600 mb-8">Please log in or create an account to continue.</p>
            <div className="flex flex-col gap-4">
              <button onClick={() => setAuthMode('login')} className="bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition">Log In</button>
              <button onClick={() => setAuthMode('signup')} className="bg-white text-blue-600 border-2 border-blue-600 font-semibold py-3 rounded-lg hover:bg-blue-50 transition">Sign Up</button>
            </div>
          </div>
        )}

        {(authMode === 'login' || authMode === 'signup') && (
          <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md relative">
            <button onClick={() => { setAuthMode('landing'); setLoginError(''); }} className="absolute top-6 left-6 text-gray-400 hover:text-gray-600 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center mt-2">{authMode === 'login' ? 'Welcome Back' : 'Create an Account'}</h2>
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              {loginError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm mb-2"><p>{loginError}</p></div>}
              <input type="text" placeholder="Enter your username..." value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              <input type="password" placeholder="Enter your password..." value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"/>
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
             <h2 className="text-2xl font-bold text-gray-800 mb-2">Creating your custom topic...</h2>
             <p className="text-gray-500">The AI is currently writing the first batch of questions for <span className="font-bold text-blue-600">{selectedTopic.name}</span>. This takes a few seconds.</p>
         </div>
      </div>
    );
  }

  if (!selectedTopic) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-5xl mx-auto">
          
          <div className="flex justify-between items-center mb-12">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-full shadow-md"><svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg></div>
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Adaptive Prep</h1>
            </div>
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-gray-800">Hi, {user.username}!</h2>
              <button onClick={() => setUser(null)} className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-1 px-3 rounded transition">Log Out</button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-100">
             <h3 className="text-lg font-bold text-gray-800 mb-3">Study a New Topic</h3>
             <div className="flex gap-3">
                <input 
                  value={newTopicInput} 
                  onChange={(e) => setNewTopicInput(e.target.value)} 
                  placeholder="e.g. World History, Python Functions, Cell Biology..." 
                  className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button 
                  onClick={handleCreateTopic} 
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg transition shadow-sm"
                >
                  Generate Topic
                </button>
             </div>
          </div>
          
          <h3 className="text-xl font-semibold text-gray-600 mb-4">Your Available Topics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {topics.map(topic => (
              <div 
                key={topic.id} 
                onClick={() => startQuiz(topic)}
                className="bg-white p-6 rounded-xl shadow-sm cursor-pointer hover:shadow-md hover:border-blue-500 border-2 border-transparent transition"
              >
                <h3 className="text-lg font-bold text-gray-800">{topic.name}</h3>
                <p className="text-sm text-gray-500 mt-2">Adaptive Learning Active</p>
              </div>
            ))}
            {topics.length === 0 && <p className="text-gray-500 col-span-3 text-center py-8">No topics created yet. Generate one above!</p>}
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
            <p className="text-xl text-gray-600">You scored <span className="font-bold text-blue-600">{score}</span> out of {questions.length}</p>
          </div>

          {/* AI Report Section */}
          {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center p-8 bg-blue-50 rounded-xl animate-pulse mb-8 border border-blue-100">
              <span className="text-5xl mb-4">🧠</span>
              <p className="text-blue-800 font-bold text-xl">AI is analyzing your performance...</p>
            </div>
          ) : aiReport && !aiReport.error ? (
            <div className="bg-linear-to-br from-indigo-50 to-blue-50 p-6 rounded-xl text-left shadow-sm border border-indigo-100 mb-8">
               <h3 className="text-xl font-bold text-indigo-900 mb-4 flex items-center gap-2">
                 <span className="text-2xl">📊</span> Your AI Tutor Report
               </h3>
               <div className="space-y-3 text-indigo-900 text-sm md:text-base">
                 <p className="bg-white p-4 rounded shadow-sm border-l-4 border-blue-500"><strong>Analysis:</strong> {aiReport.analysis}</p>
                 <p className="bg-white p-4 rounded shadow-sm border-l-4 border-red-400"><strong>Target Areas:</strong> {aiReport?.weak_points?.join(', ') || 'None identified'}</p>
                 <p className="bg-white p-4 rounded shadow-sm border-l-4 border-green-500"><strong>Next Step:</strong> {aiReport.recommended_next_step}</p>
                 <div className="bg-indigo-600 text-white p-4 rounded text-center font-bold mt-6 shadow-md">
                   {aiReport.generated_new_questions
                     ? `✅ Generated brand new Level ${aiReport.new_difficulty} questions based on your results!`
                     : `✅ Difficulty maintained at Level ${aiReport.new_difficulty}.`}
                 </div>
               </div>
            </div>
          ) : null}

          {/* New Review Section */}
          <div className="border-t border-gray-200 pt-8 mb-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <span className="text-2xl">📝</span> Review Your Answers
            </h3>
            
            <div className="space-y-6">
              {userAnswers.map((ans, idx) => (
                <div key={idx} className={`p-5 rounded-lg border-l-4 shadow-sm ${ans.isCorrect ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
                  <p className="font-bold text-gray-800 mb-3">{idx + 1}. {ans.question.question_text}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                    <div className="bg-white p-3 rounded shadow-sm">
                      <p className="text-sm text-gray-500 mb-1">Your Answer:</p>
                      <p className={`font-medium ${ans.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                        {ans.selected} {ans.isCorrect ? '✅' : '❌'}
                      </p>
                    </div>
                    
                    {!ans.isCorrect && (
                      <div className="bg-white p-3 rounded shadow-sm">
                        <p className="text-sm text-gray-500 mb-1">Correct Answer:</p>
                        <p className="font-medium text-green-700">{ans.question.correct_answer} ✅</p>
                      </div>
                    )}
                  </div>

                  {/* AI Explanation directly from the Database! */}
                  {ans.question.explanation && (
                    <div className="mt-4 p-4 bg-white rounded-lg text-gray-700 text-sm shadow-sm border border-gray-100">
                      <strong className="text-blue-600">AI Explanation:</strong> {ans.question.explanation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button onClick={resetDashboard} className="bg-blue-600 text-white font-bold px-8 py-4 rounded-lg hover:bg-blue-700 transition shadow-lg w-full text-lg">
            {aiReport ? "Return to Dashboard" : "Back to Topics"}
          </button>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentQIndex];
  
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-2xl">
        <div className="flex justify-between items-center mb-6">
          <span className="text-sm font-semibold text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
            Question {currentQIndex + 1} of {questions.length}
          </span>
          <span className="text-sm text-gray-500 font-medium">Level: {currentQ?.difficulty_level}</span>
        </div>
        
        <h2 className="text-xl font-bold text-gray-800 mb-8">{currentQ?.question_text}</h2>
        
        <div className="flex flex-col gap-3">
          {currentQ?.options && currentQ.options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => handleAnswer(option)}
              className="text-left w-full p-4 border rounded-lg hover:bg-blue-50 hover:border-blue-500 transition text-gray-700 font-medium"
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;