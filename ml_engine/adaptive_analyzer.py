import sys
import os
import json
import time
import psycopg2
from groq import Groq
from dotenv import load_dotenv

# Force UTF-8 for Windows compatibility
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

from generate_questions import generate_questions, save_questions_to_db

load_dotenv()

# 1. Initialize the GROQ Client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def get_db_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))

def run_adaptive_loop(username):
    # 1. Fetch History
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        user_row = cursor.fetchone()
        if not user_row: return
        
        query = """
            SELECT t.name as topic_name, q.difficulty_level, a.is_correct, a.time_taken_seconds
            FROM attempt_history a
            JOIN questions q ON a.question_id = q.id
            JOIN topics t ON q.topic_id = t.id
            WHERE a.user_id = %s
            ORDER BY a.attempted_at DESC LIMIT 20;
        """
        cursor.execute(query, (user_row[0],))
        history_data = [{"topic": r[0], "difficulty": r[1], "correct": r[2], "time_seconds": r[3]} for r in cursor.fetchall()]
    finally:
        cursor.close()
        conn.close()

    if not history_data: return

    current_diff = history_data[0]['difficulty']
    topic_name = history_data[0]['topic']

    # 2. AI Analysis using GROQ
    model_id = 'llama-3.1-8b-instant'
    prompt = f"""
    Analyze student: {username}.
    History: {json.dumps(history_data)}
    Return ONLY a JSON object strictly in this format: {{"analysis": "str", "weak_points": ["str"], "recommended_next_step": "str", "adjust_difficulty": "INCREASE/DECREASE/MAINTAIN"}}
    """
    
    # 🛡️ THE GRACEFUL FALLBACK
    analysis_json = {
        "analysis": "The AI Tutor is currently experiencing high traffic and could not generate a custom analysis.",
        "weak_points": ["N/A"],
        "recommended_next_step": "Keep practicing! We will maintain your current difficulty level for now.",
        "adjust_difficulty": "MAINTAIN"
    }
    
    retries = [2, 5] 
    for wait_time in [0] + retries:
        try:
            if wait_time > 0: time.sleep(wait_time)
            
            # GROQ SDK Generation call
            response = client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            
            raw_text = response.choices[0].message.content.strip()
            analysis_json = json.loads(raw_text)
            break 
        except Exception as e:
            error_msg = str(e)
            if 'rate limit' in error_msg.lower() and wait_time != retries[-1]: 
                continue 
            
            print(f"AI Error gracefully caught: {e}", file=sys.stderr)
            break

    # 3. Adjust Difficulty
    action = analysis_json.get('adjust_difficulty', 'MAINTAIN')
    new_diff = current_diff
    
    if action == 'INCREASE': 
        new_diff += 1
    elif action == 'DECREASE' and current_diff > 1: 
        new_diff -= 1
    
    # 4. Generate next batch
    new_qs = generate_questions(topic_name, num_questions=3, difficulty=new_diff)
    if new_qs:
        save_questions_to_db(topic_name, new_qs, difficulty=new_diff)
        
    final_report = {
        "analysis": analysis_json.get('analysis', "Keep up the good work!"),
        "weak_points": analysis_json.get('weak_points', []),
        "recommended_next_step": analysis_json.get('recommended_next_step', "Review and try again."),
        "adjust_difficulty": action,
        "new_difficulty": new_diff,
        "generated_new_questions": bool(new_qs)
    }
    
    print("___JSON_START___")
    print(json.dumps(final_report))
    print("___JSON_END___")

if __name__ == "__main__":
    target_username = sys.argv[1] if len(sys.argv) > 1 else "hsbhu"
    run_adaptive_loop(target_username)