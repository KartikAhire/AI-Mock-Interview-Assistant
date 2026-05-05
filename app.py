import os
import google.generativeai as genai
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import PyPDF2
import re
import markdown

# Environment variables load karein
load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY .env file mein nahi mili.")

# Gemini ko configure karein
genai.configure(api_key=GOOGLE_API_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

app = Flask(__name__)
chats = {}

# System prompts generate karne ke liye helper function
def get_system_prompt(session_type, job_title, resume_text):
    if session_type == "English Practice":
        return """
        You are 'Sarah', a friendly and encouraging English language coach and conversation partner.
        Your primary goal is to have a natural, two-way conversation with the user in English to help them practice.
        
        **Your Behavior:**
        - **Be a conversation partner:** If the user asks you a question, answer it naturally and conversationally.
        - **Ask questions too:** To keep the conversation flowing, also ask casual, open-ended questions.
        - **Provide gentle feedback:** Occasionally offer a small, positive correction on their grammar or word choice.
        - **Keep it relaxed:** This is not an interview. Be friendly and supportive.
        """
    elif session_type == "DSA Quiz":
        return f"""
        You are an expert in Data Structures and Algorithms. You will conduct a quiz.
        - Ask one DSA question at a time, relevant to a '{job_title}' role.
        - After the user answers, tell them if they are correct and provide a brief, clear explanation. Then, ask the next question.
        """
    else:
        return f"""
        You are 'Sarah', a professional AI interviewer for a '{job_title}' role.
        Your ONLY job is to ask questions based on the candidate's resume and the session type: '{session_type}'.
        
        **VERY IMPORTANT RULES:**
        1.  **YOUR ROLE:** You are the INTERVIEWER. The user is the CANDIDATE.
        2.  **ASK, DON'T ANSWER:** If the user asks YOU a question, politely redirect them.
        3.  **STAY CONCISE:** Keep your questions short and direct.
        4.  **RESUME-FOCUSED:** Base your questions on the provided resume.

        Candidate's Resume:
        ---
        {resume_text}
        ---
        """

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/upload_resume', methods=['POST'])
def upload_resume():
    if 'resume' not in request.files: return jsonify({'error': 'No file part'}), 400
    file = request.files['resume']
    if file.filename == '' or not file.filename.endswith('.pdf'): return jsonify({'error': 'Invalid file'}), 400
    try:
        pdf_reader = PyPDF2.PdfReader(file.stream)
        text = "".join(page.extract_text() for page in pdf_reader.pages)
        return jsonify({'text': text})
    except Exception as e:
        return jsonify({'error': f'Failed to parse PDF: {str(e)}'}), 500

@app.route('/start_interview', methods=['POST'])
def start_interview():
    data = request.json
    session_id = "default_user"
    interview_round = data.get('interview_round')
    
    system_prompt = get_system_prompt(
        interview_round,
        data.get('job_title'),
        data.get('resume_text')
    )
    
    chats[session_id] = model.start_chat(history=[
        {'role': 'user', 'parts': [{'text': system_prompt}]},
        {'role': 'model', 'parts': [{'text': "Understood. I am ready to begin the session."}]}
    ])
    
    if interview_round == "English Practice":
        first_question_prompt = "Hi there! I'm Sarah, your English coach for today. To start, how has your day been?"
    elif interview_round == "DSA Quiz":
        first_question_prompt = "Welcome to the DSA quiz! Let's warm up. What is the time complexity of a binary search algorithm?"
    else:
        first_question_prompt = "Hello, I'm Sarah. I'll be conducting your interview today. Let's begin."

    try:
        response = chats[session_id].send_message(first_question_prompt)
        return jsonify({'message': response.text})
    except Exception as e:
        return jsonify({'message': f'Error starting AI chat: {str(e)}'}), 500

@app.route('/ask_question', methods=['POST'])
def ask_question():
    session_id = "default_user"
    chat = chats.get(session_id)
    if not chat: return jsonify({'message': 'Session not started.'}), 400
    
    user_message = request.json.get('message', "Could you repeat that?")
    try:
        response = chat.send_message(user_message)
        return jsonify({'message': response.text})
    except Exception as e:
        return jsonify({'message': f'Error with AI: {str(e)}'}), 500

@app.route('/initiate_final_phase', methods=['POST'])
def initiate_final_phase():
    session_id = "default_user"
    chat = chats.get(session_id)
    if not chat: return jsonify({'error': 'No active session found'}), 400
    final_prompt = "The main part of the interview is over. Now, ask the candidate: 'That's all the questions I have for you. Do you have any questions for me about the role or the company?'. Then, change your role to answer their questions professionally."
    try:
        response = chat.send_message(final_prompt)
        return jsonify({'message': response.text})
    except Exception as e:
        return jsonify({'error': f'Could not initiate final phase: {str(e)}'}), 500

@app.route('/get_feedback', methods=['POST'])
def get_feedback():
    session_id = "default_user"
    chat = chats.get(session_id)
    if not chat: return jsonify({'error': 'No active session found'}), 400
    
    full_history = chat.history
    
    feedback_prompt = f"""
    Based on the following interview transcript, please provide a detailed performance report for the candidate (the 'user').
    Analyze the entire conversation and generate a report in Markdown format.

    The report must include these sections:
    
    ## Overall Summary
    A brief, encouraging overview of the candidate's performance.

    ## Communication Skills (Score: X/10)
    - **Clarity & Conciseness:** How clear and to-the-point were their answers?
    - **Confidence:** Did they sound confident?
    - **Filler Words:** Note any significant use of filler words (um, ah, like).
    
    ## Technical & Behavioral Analysis
    - **Content Quality:** Evaluate the quality and correctness of their answers based on the interview questions.
    - **STAR Method (for behavioral questions):** If applicable, did they structure their answers using the Situation, Task, Action, Result method?

    ## Action Plan for Improvement
    Provide a bulleted list of 3-5 specific, actionable steps the candidate can take to improve.

    **Transcript:**
    ---
    {full_history}
    ---
    """
    
    try:
        feedback_model = genai.GenerativeModel('gemini-1.5-flash')
        response = feedback_model.generate_content(feedback_prompt)
        html_feedback = markdown.markdown(response.text)
        return jsonify({'feedback': html_feedback})
    except Exception as e:
        return jsonify({'error': f'Could not generate feedback: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True)