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

load_dotenv()

# 1. Initialize the GROQ Client
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def get_db_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))

def generate_questions(topic_name, num_questions=3, difficulty=1):
    # Using Groq's lightning-fast LLaMA 3 model
    model_id = 'llama-3.1-8b-instant' 
    
    prompt = f"""
    Generate {num_questions} multiple-choice questions about '{topic_name}' at difficulty level {difficulty} (1=Beginner, 10=Expert).
    Return ONLY a JSON object with a single key 'questions' containing an array of objects with this exact structure:
    {{
        "questions": [
            {{
                "question_text": "str",
                "options": ["str", "str", "str", "str"],
                "correct_answer": "str",
                "explanation": "str"
            }}
        ]
    }}
    """
    
    # We still keep a small retry loop just in case of network blips
    retries = [2, 5] 
    
    for wait_time in [0] + retries:
        try:
            if wait_time > 0:
                print(f"[INFO] Network delay. Waiting {wait_time} seconds before retrying...", file=sys.stderr)
                time.sleep(wait_time)
                
            # GROQ SDK Syntax with Strict JSON format
            response = client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"}
            )
            
            raw_text = response.choices[0].message.content.strip()
            
            # Since Groq forces JSON, we can parse immediately
            data = json.loads(raw_text)
            
            # Extract the array from the required JSON object wrapper
            return data.get("questions", [])
            
        except Exception as e:
            error_msg = str(e)
            if 'rate limit' in error_msg.lower() and wait_time != retries[-1]:
                continue 
                
            print(f"[AI ERROR] Failed to generate or parse questions: {e}", file=sys.stderr)
            return []

def save_questions_to_db(topic_name, questions, difficulty=1):
    if not questions:
        return
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Get or create topic
        cursor.execute("SELECT id FROM topics WHERE name = %s", (topic_name,))
        topic_row = cursor.fetchone()
        if topic_row:
            topic_id = topic_row[0]
        else:
            cursor.execute("INSERT INTO topics (name) VALUES (%s) RETURNING id", (topic_name,))
            topic_id = cursor.fetchone()[0]

        # Insert questions
        for q in questions:
            cursor.execute("""
                INSERT INTO questions (topic_id, difficulty_level, question_text, options, correct_answer, explanation)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                topic_id, 
                difficulty, 
                q['question_text'], 
                json.dumps(q['options']), 
                q['correct_answer'], 
                q.get('explanation', '')
            ))
        conn.commit()
        print(f"[SUCCESS] Saved {len(questions)} questions!")
    except Exception as e:
        print(f"[ERROR] Database transaction failed: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    target_topic = sys.argv[1] if len(sys.argv) > 1 else "Machine Learning Basics"
    
    try:
        diff = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    except ValueError:
        diff = 1
        
    generated_data = generate_questions(topic_name=target_topic, num_questions=3, difficulty=diff)
    
    if generated_data:
        save_questions_to_db(topic_name=target_topic, questions=generated_data, difficulty=diff)
    else:
        print("[ERROR] No questions were generated.", file=sys.stderr)
        sys.exit(1)