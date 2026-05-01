import requests
import time
import textstat
import matplotlib.pyplot as plt
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from rouge_score import rouge_scorer
from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction

# Configuration
API_URL = "http://127.0.0.1:8000/v1/generate"

def get_metrics(input_text, output_text, reference_text, latency):
    print(f"\n--- Metrics Analysis ---")
    
    # 1. Readability Scores (Flesch-Kincaid Grade Level)
    fk_original = textstat.flesch_kincaid_grade(input_text)
    fk_simplified = textstat.flesch_kincaid_grade(output_text)
    print(f"Flesch-Kincaid Grade (Original): {fk_original}")
    print(f"Flesch-Kincaid Grade (Simplified): {fk_simplified}")
    
    # 2. Semantic Similarity (Cosine Similarity)
    vectorizer = TfidfVectorizer()
    tfidf_matrix = vectorizer.fit_transform([input_text, output_text])
    similarity = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
    print(f"Semantic Similarity (Cosine): {similarity:.4f}")

    # 3. Accuracy Metrics (ROUGE & BLEU)
    # ROUGE-L (Longest Common Subsequence) - Measures Recall of Content
    scorer = rouge_scorer.RougeScorer(['rougeL'], use_stemmer=True)
    scores = scorer.score(reference_text, output_text)
    rouge_l = scores['rougeL'].fmeasure
    print(f"ROUGE-L Score (F1): {rouge_l:.4f}")

    # BLEU Score (Bilingual Evaluation Understudy) - Measures Precision of Phrasing
    # Using smoothing to handle short sentences gracefully
    smooth = SmoothingFunction().method1
    bleu = sentence_bleu([reference_text.split()], output_text.split(), smoothing_function=smooth)
    print(f"BLEU Score: {bleu:.4f}")

    # 4. Latency
    print(f"Latency: {latency:.4f} seconds")

    return {
        "fk_original": fk_original,
        "fk_simplified": fk_simplified,
        "similarity": similarity,
        "rouge_l": rouge_l,
        "bleu": bleu,
        "latency": latency
    }

def plot_metrics(results):
    # --- Plot 1: Readability ---
    plt.figure(figsize=(10, 8))
    
    labels_read = ['Original']
    values_read = [results['Simplification']['fk_original']]
    colors_read = ['#94a3b8']

    if 'Simplification' in results:
        labels_read.append('Simplify')
        values_read.append(results['Simplification']['fk_simplified'])
        colors_read.append('#22c55e')
    if 'Explanation' in results:
        labels_read.append('Explain')
        values_read.append(results['Explanation']['fk_simplified'])
        colors_read.append('#3b82f6')
    if 'Expansion' in results:
        labels_read.append('Expand')
        values_read.append(results['Expansion']['fk_simplified'])
        colors_read.append('#8b5cf6')

    bars1 = plt.bar(labels_read, values_read, color=colors_read)
    plt.ylabel('Flesch-Kincaid Grade')
    plt.title('Readability Control (Lower = Simpler)', fontweight='bold')
    plt.ylim(0, max(values_read) + 5)
    
    for bar in bars1:
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height + 0.2, f'{height:.1f}', ha='center', va='bottom')
    
    plt.tight_layout()
    plt.savefig('research_plot_readability.png')
    plt.close()
    print("Saved 'research_plot_readability.png'")

    # --- Plot 2: Content Preservation ---
    plt.figure(figsize=(10, 8))
    sim_labels = []
    sim_values = []
    sim_colors = []
    
    tasks_map = [
        ('Simplification', 'Simplify', '#22c55e'),
        ('Explanation', 'Explain', '#3b82f6'),
        ('Expansion', 'Expand', '#8b5cf6')
    ]

    for key, label, color in tasks_map:
        if key in results and 'similarity' in results[key]:
            sim_labels.append(label)
            sim_values.append(results[key]['similarity'])
            sim_colors.append(color)

    bars2 = plt.bar(sim_labels, sim_values, color=sim_colors)
    plt.title('Semantic Consistency (Higher = Better Preservation)', fontweight='bold')
    plt.ylabel('Cosine Similarity (0-1)')
    plt.ylim(0, 1.15)

    for bar in bars2:
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height + 0.02, f'{height:.2f}', ha='center', va='bottom')
    
    plt.tight_layout()
    plt.savefig('research_plot_consistency.png')
    plt.close()
    print("Saved 'research_plot_consistency.png'")

    # --- Plot 3: Latency ---
    plt.figure(figsize=(10, 8))
    ordered_keys = ['Simplification', 'Explanation', 'Expansion', 'Translation (Hindi)']
    display_names = ['Simplify', 'Explain', 'Expand', 'Translate\n(Hindi)']
    colors_lat = ['#22c55e', '#3b82f6', '#8b5cf6', '#ef4444']
    
    latencies = []
    for key in ordered_keys:
        if key in results:
            latencies.append(results[key]['latency'])
        else:
            latencies.append(0)

    bars3 = plt.bar(display_names, latencies, color=colors_lat)
    plt.title('Computational Cost (Lower = Faster)', fontweight='bold')
    plt.ylabel('Time (Seconds)')
    
    for bar in bars3:
        height = bar.get_height()
        if height > 0:
            plt.text(bar.get_x() + bar.get_width()/2., height + 0.5, f'{height:.1f}s', ha='center', va='bottom')
            
    plt.tight_layout()
    plt.savefig('research_plot_latency.png')
    plt.close()
    print("Saved 'research_plot_latency.png'")

    # --- Plot 4: Accuracy ---
    plt.figure(figsize=(10, 8))
    acc_labels = ['ROUGE-L (Recall)', 'BLEU (Precision)']
    acc_values = [0, 0]
    
    if 'Simplification' in results:
        acc_values = [results['Simplification']['rouge_l'], results['Simplification']['bleu']]

    bars4 = plt.bar(acc_labels, acc_values, color=['#fbbf24', '#f59e0b'])
    plt.title('Generation Accuracy (Simplify)', fontweight='bold')
    plt.ylabel('Score (0-1)')
    plt.ylim(0, 1.0)
    
    for bar in bars4:
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height + 0.02, f'{height:.4f}', ha='center', va='bottom', fontweight='bold')

    plt.tight_layout()
    plt.savefig('research_plot_accuracy.png')
    plt.close()
    print("Saved 'research_plot_accuracy.png'")


def main():
    print("Starting Research Metrics Evaluation...")
    
    input_text = """Artificial Intelligence (AI) refers to the simulation of human intelligence in machines that are programmed to think like humans and mimic their actions. The term may also be applied to any machine that exhibits traits associated with a human mind such as learning and problem-solving. The ideal characteristic of artificial intelligence is its ability to rationalize and take actions that have the best chance of achieving a specific goal. A subset of artificial intelligence is machine learning, which refers to the concept that computer programs can automatically learn from and adapt to new data without being assisted by humans. Deep learning techniques enable this automatic learning through the absorption of huge amounts of unstructured data such as text, images, or video."""
    
    # Gold Standard Reference (Human Simplification) for Accuracy Calculation
    reference_text = "Artificial Intelligence (AI) means making machines think and act like humans. It includes computers that can learn and solve problems on their own. The main goal of AI is to make decisions that best achieve a specific goal. Machine learning is a type of AI where computers learn from new data without human help. Deep learning uses huge amounts of data, like text or images, to help computers learn automatically."

    tasks = [
        {"action": "simplify", "label": "Simplification", "targetLanguage": None},
        {"action": "explain", "label": "Explanation", "targetLanguage": None},
        {"action": "expand", "label": "Expansion", "targetLanguage": None},
        {"action": "translate", "label": "Translation (Hindi)", "targetLanguage": "Hindi"}
    ]

    results = {}

    for task in tasks:
        print(f"\n--- Running Task: {task['label']} ---")
        payload = {
            "actionType": task['action'],
            "prompt": input_text,
            "forceProvider": "local", 
            "targetLanguage": task['targetLanguage']
        }

        try:
            print(f"Sending request to {API_URL}...")
            start_time = time.time()
            response = requests.post(API_URL, json=payload)
            end_time = time.time()
            
            latency = end_time - start_time
            
            if response.status_code == 200:
                result = response.json()
                output_text = result.get("output", "")
                
                print(f"Latency: {latency:.4f}s")
                
                metrics = {"latency": latency}
                
                # Calculate text metrics for English tasks
                if task['targetLanguage'] is None:
                     metrics.update(get_metrics(input_text, output_text, reference_text, latency))
                
                results[task['label']] = metrics
                
            else:
                print(f"Error: API returned status code {response.status_code}")
                
        except requests.exceptions.ConnectionError:
            print(f"Error: Could not connect to {API_URL}.")
            return

    # Plot results
    if results:
         plot_metrics(results)



if __name__ == "__main__":
    main()
