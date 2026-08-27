import os
import sys
import json
import urllib.request
import urllib.error
from pypdf import PdfReader

if len(sys.argv) < 2:
    print("ERROR: Missing PDF path parameter")
    sys.exit(1)

pdf_path = sys.argv[1]
output_json_path = os.path.join(os.path.dirname(__file__), '../../resume.json')

if not os.path.exists(pdf_path):
    print(f"ERROR: PDF file not found at {pdf_path}")
    sys.exit(1)

try:
    reader = PdfReader(pdf_path)
    text_content = ""
    for page in reader.pages:
        text_content += page.extract_text() + "\n"
except Exception as e:
    print(f"ERROR: Failed to read PDF: {e}")
    sys.exit(1)

api_key = "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"
api_url = "https://integrate.api.nvidia.com/v1/chat/completions"

system_prompt = """You are an expert resume parser. 
Convert the raw text extracted from a resume PDF into a structured JSON format matching this schema:
{
  "personalInfo": {
    "name": "Full Name",
    "title": "Job Title",
    "email": "Email",
    "phone": "Phone",
    "location": "Location",
    "github": "GitHub URL",
    "linkedin": "LinkedIn URL"
  },
  "summary": "Professional Summary statement",
  "skills": {
    "Languages": ["Python", "JavaScript"],
    "Frontend": ["React"],
    "Backend": ["Node.js"],
    "Tools": ["Git"]
  },
  "experience": [
    {
      "company": "Company Name",
      "role": "Job Role",
      "duration": "Duration (e.g. June 2023 - Present)",
      "highlights": [
        "Achievement bullet point 1"
      ]
    }
  ],
  "projects": [
    {
      "title": "Project Name",
      "techStack": "Technologies used (comma-separated string)",
      "highlights": [
        "Project achievement bullet point 1"
      ]
    }
  ],
  "education": [
    {
      "institution": "University/College",
      "degree": "Degree",
      "duration": "Duration",
      "details": "Major / GPA or details"
    }
  ]
}
Return ONLY the JSON object."""

user_prompt = f"Resume raw text:\n\n{text_content}\n\nParse this resume into the JSON schema now."

payload = {
    "model": "meta/llama-3.2-11b-vision-instruct",
    "messages": [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ],
    "temperature": 0.1,
    "max_tokens": 2048
}

try:
    req = urllib.request.Request(
        api_url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}'
        },
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        res_data = json.loads(response.read().decode('utf-8'))
        raw_output = res_data['choices'][0]['message']['content'].strip()
        if raw_output.startswith("```"):
            lines = raw_output.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].startswith("```"):
                lines = lines[:-1]
            raw_output = "\n".join(lines).strip()
        
        parsed_json = json.loads(raw_output)
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(parsed_json, f, indent=2, ensure_ascii=False)
        
        print(json.dumps(parsed_json))
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
