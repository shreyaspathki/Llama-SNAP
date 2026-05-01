from __future__ import annotations
import os
from typing import Optional

# pydantic_ai imports
# We use a try-except block to gracefully handle if pydantic-ai is not installed or errors
try:
    from pydantic_ai import Agent
    from pydantic_ai.models.groq import GroqModel
except ImportError:
    Agent = None # type: ignore
    GroqModel = None # type: ignore


def get_system_prompt(action_type: str, target_language: Optional[str] = None) -> str:
    """Returns the system prompt for the specific action type."""
    action_type = action_type.lower()
    
    if action_type == 'translate':
        lang = target_language or "English"
        # Map common codes if needed
        if lang.lower() == 'hi': lang = "Hindi"
        if lang.lower() == 'kn': lang = "Kannada"
        
        return (
            f"You are a professional translator translating text to {lang}. "
            "Your Goal: Provide a fluent and accurate translation. "
            "CRITICAL RULES:\\n"
            "1. Translate EVERY word, including colors (e.g., 'orange' -> 'नारंगी'), objects, and concepts.\\n"
            "2. Do NOT leave English words in the output unless they are proper names (like 'Google' or 'Facebook') that have no translation.\\n"
            "3. Use natural sentence structure in the target language (subject-object-verb for Hindi/Kannada).\\n"
            "4. Output ONLY the translation, no introductory text."
        )
    
    if action_type == 'qa' or action_type == 'q&a':
        return (
            "You are a highly intelligent and helpful AI assistant. "
            "Your goal is to answer the user's questions as clearly and accurately as possible. "
            "If the question is complex, break it down using bullet points. "
            "Maintain a friendly and professional tone. "
            "Answer directly."
        )
    elif action_type == 'simplify':
        return (
            "You are an expert rewriting assistant specializing in accessibility. "
            "Your task is to Rewrite the User's text to be very simple and easy to read. "
            "Use plain language, short sentences, and active voice. "
            "Aim for a reading level suitable for a 10-year-old or someone with cognitive disabilities. "
            "Do not change the underlying meaning, just the presentation. "
            "IMPORTANT: Output ONLY the simplified text. Do not include any heading, intro, note, explanation, or closing remark. "
            "Return the rewritten text directly, with no extra sentence before or after it."
        )
    elif action_type == 'explain':
        return (
            "You are an expert tutor. "
            "Explain the main concepts in the User's text clearly and concisely. "
            "Break down complex ideas into understandable parts. "
            "Provide a brief example if it helps clarify. "
            "Provide the explanation directly without meta-commentary."
        )
    elif action_type == 'summarize':
        return (
            "You are an expert summarizer. "
            "Provide a concise summary of the User's text in one short paragraph. "
            "Capture the most important points without unnecessary fluff. "
            "Output ONLY the summary."
        )
    elif action_type == 'expand':
        return (
            "You are a helpful writing assistant. "
            "Expand on the User's text by adding more details, context, and relevant examples. "
            "Make the text more comprehensive while maintaining a consistent tone. "
            "Directly provide the expanded text."
        )
    else:
        return "You are a helpful, harmless, and honest AI assistant."


def run_pydantic_ai_agent(action_type: str, prompt: str, model_name: str, api_key: str, target_language: Optional[str] = None) -> str:
    """
    Runs a Pydantic AI agent for the specified action.
    """
    if Agent is None or GroqModel is None:
        raise RuntimeError("pydantic-ai library is not installed or could not be imported.")

    # Initialize the Groq Model
    model = GroqModel(model_name, api_key=api_key)
    
    # Get the specialized system prompt for standard actions
    sys_prompt = get_system_prompt(action_type, target_language=target_language)
    
    # Create the Agent
    agent = Agent(model, system_prompt=sys_prompt)
    
    # Run the agent (synchronously for now to fit the FastAPI handler)
    # Note: agent.run() is async, agent.run_sync() is sync
    try:
        result = agent.run_sync(prompt)
        return result.data
    except Exception as e:
        print(f"Agent Run Failed: {e}")
        return None
