import sys
import os
import json
import time
import psycopg2
import google.generativeai as genai
from dotenv import load_dotenv

if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

from generate_questions import generate_questions, save_questions_to_db

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def get_db_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))

def get_valid_model():
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods and ('flash' in m.name or 'pro' in m.name):
            return m.name.replace('models/', '')
    return 'gemini-pro'

def fetch_user_history(username):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        user_row = cursor.fetchone()
        if not user_row: return None
        
        query = """
            SELECT t.name as topic_name, q.difficulty_level, a.is_correct, a.time_taken_seconds
            FROM attempt_history a
            JOIN questions q ON a.question_id = q.id
            JOIN topics t ON q.topic_id = t.id
            WHERE a.user_id = %s
            ORDER BY a.attempted_at DESC LIMIT 50;
        """
        cursor.execute(query, (user_row[0],))
        records = cursor.fetchall()
        
        if not records: return None
        return [{"topic": r[0], "difficulty": r[1], "correct": r[2], "time_seconds": r[3]} for r in records]
    finally:
        cursor.close()
        conn.close()

def run_adaptive_loop(username):
    history_data = fetch_user_history(username)
    if not history_data: return
        
    model = genai.GenerativeModel('gemini-1.5-flash')
    prompt = f"""
    You are an AI tutor. Student: {username}.
    Raw data (latest attempts first): {json.dumps(history_data, indent=2)}
    
    Analyze performance based on Accuracy, Speed, and Topic trends.
    Return STRICTLY as a JSON object:
    - "analysis": A 2-sentence summary.
    - "weak_points": Array of 1-2 weak areas.
    - "recommended_next_step": Next study step.
    - "adjust_difficulty": STRICTLY "INCREASE", "DECREASE", or "MAINTAIN".
    """
    
    # Rate Limit Protection (Auto-Retry)
    max_retries = 3
    analysis_json = None
    
    for attempt in range(max_retries):
        try:
            response = model.generate_content(prompt)
            raw_text = response.text.strip()
            if raw_text.startswith('`' * 3 + 'json'):
                raw_text = raw_text[7:-3].strip()
            elif raw_text.startswith('`' * 3):
                raw_text = raw_text[3:-3].strip()
                
            analysis_json = json.loads(raw_text)
            break
        except Exception as e:
            if '429' in str(e) and attempt < max_retries - 1:
                time.sleep(5) # Wait 5 seconds to bypass the block
            else:
                print(f"Error: {e}")
                return
                
    if not analysis_json:
        return

    action = analysis_json.get('adjust_difficulty', 'MAINTAIN')
    current_diff = history_data[0]['difficulty']
    new_diff = current_diff
    
    if action == 'INCREASE': 
        new_diff += 1
    elif action == 'DECREASE' and current_diff > 1: 
        new_diff -= 1
    
    topic_name = history_data[0]['topic']
    
    new_qs = generate_questions(topic_name, num_questions=3, difficulty=new_diff)
    if new_qs:
        save_questions_to_db(topic_name, new_qs)
        
    final_report = {
        "analysis": analysis_json.get('analysis'),
        "weak_points": analysis_json.get('weak_points', []),
        "recommended_next_step": analysis_json.get('recommended_next_step'),
        "adjust_difficulty": action,
        "new_difficulty": new_diff,
        "generated_new_questions": bool(new_qs)
    }
    
    print("___JSON_START___")
    print(json.dumps(final_report))
    print("___JSON_END___")

if __name__ == "__main__":
    target_username = sys.argv[1] if len(sys.argv) > 1 else "test_user"
    run_adaptive_loop(target_username)