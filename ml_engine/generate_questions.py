import sys
import os
import json
import time
import psycopg2
import google.generativeai as genai
from dotenv import load_dotenv

# 🔥 BULLETPROOF WINDOWS FIX: Force the terminal to accept emojis/special characters
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("[ERROR] Could not find GEMINI_API_KEY.")
else:
    print("[SUCCESS] API Key successfully loaded.")

genai.configure(api_key=api_key)

def get_db_connection():
    try:
        return psycopg2.connect(os.getenv("DATABASE_URL"))
    except Exception as e:
        print(f"[ERROR] Error connecting to the database: {e}")
        return None

def get_valid_model():
    try:
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods and ('flash' in m.name or 'pro' in m.name):
                return m.name.replace('models/', '')
        return 'gemini-pro'
    except Exception:
        return 'gemini-pro'

def generate_questions(topic_name, num_questions=3, difficulty=1):
    print(f"\nGenerating {num_questions} questions for topic: '{topic_name}' (Difficulty: {difficulty})...")
    
    model_name = get_valid_model()
    if not model_name: return None
        
    model = genai.GenerativeModel(model_name)
    
    prompt = f"""
    You are an expert tutor. Generate {num_questions} multiple-choice questions about the topic '{topic_name}'.
    The difficulty level is {difficulty} (where 1 is beginner, scaling upwards infinitely for advanced concepts).
    
    Return the response STRICTLY as a JSON array of objects. Do not include markdown formatting or backticks.
    Each object must have the exact following keys:
    - "question_text": The actual question.
    - "options": An array of exactly 4 strings representing the choices.
    - "correct_answer": A string that exactly matches one of the options.
    - "difficulty_level": An integer representing the difficulty ({difficulty}).
    - "explanation": A short 1-2 sentence explanation of why the correct answer is right.
    """
    
    # Rate Limit Protection (Auto-Retry)
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = model.generate_content(prompt)
            raw_text = response.text.strip()
            if raw_text.startswith('`' * 3 + 'json'):
                raw_text = raw_text[7:-3].strip()
            elif raw_text.startswith('`' * 3):
                raw_text = raw_text[3:-3].strip()
            return json.loads(raw_text)
        except Exception as e:
            if '429' in str(e) and attempt < max_retries - 1:
                print(f"[WARNING] Rate limit hit. Retrying in 5 seconds...")
                time.sleep(5)
            else:
                print(f"[ERROR] Failed to parse AI response. {e}")
    return None

def save_questions_to_db(topic_name, questions):
    if not questions: return
    conn = get_db_connection()
    if not conn: return
    cursor = conn.cursor()
    
    try:
        # AUTO-PATCH: Ensure the explanation column exists so it NEVER crashes!
        cursor.execute("ALTER TABLE questions ADD COLUMN IF NOT EXISTS explanation TEXT;")
        conn.commit()
    except Exception:
        conn.rollback()
        
    try:
        cursor.execute("SELECT id FROM topics WHERE name = %s", (topic_name,))
        topic = cursor.fetchone()
        
        if topic:
            topic_id = topic[0]
        else:
            cursor.execute("INSERT INTO topics (name, difficulty_weight) VALUES (%s, %s) RETURNING id", (topic_name, 1))
            topic_id = cursor.fetchone()[0]
            
        for q in questions:
            options_json = json.dumps(q['options'])
            cursor.execute("""
                INSERT INTO questions (topic_id, question_text, options, correct_answer, difficulty_level, explanation)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (topic_id, q['question_text'], options_json, q['correct_answer'], q['difficulty_level'], q.get('explanation', '')))
            
        conn.commit()
        print(f"[SUCCESS] Saved {len(questions)} questions!")
    except Exception as e:
        print(f"[ERROR] Database transaction failed: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    target_topic = sys.argv[1] if len(sys.argv) > 1 else "Machine Learning Basics"
    generated_data = generate_questions(topic_name=target_topic, num_questions=3, difficulty=1)
    if generated_data:
        save_questions_to_db(topic_name=target_topic, questions=generated_data)