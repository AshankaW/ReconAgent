#!/usr/bin/env python3
"""
HTB Recon Agent - Local Backend (Google Gemini Edition)
Runs on your Kali machine. Executes recon tools and proxies Gemini API calls.
The React frontend talks to this via HTTP on localhost:5000.
"""

import subprocess
import json
import os
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)  # Allow the React frontend to talk to us

# Initialize Google GenAI client
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# ─────────────────────────────────────────────
# TOOL DEFINITIONS & FUNCTIONS
# ─────────────────────────────────────────────

def run_nmap(target: str, flags: str) -> str:
    """Run nmap against the target. Use for initial port discovery and service enumeration."""
    return run_command(f"nmap {flags} {target}")

def run_gobuster(target: str, wordlist: str = "/usr/share/wordlists/dirb/common.txt", extensions: str = "") -> str:
    """Run gobuster for web directory/file enumeration. Use when HTTP/HTTPS ports are open."""
    cmd = f"gobuster dir -u {target} -w {wordlist}"
    if extensions:
        cmd += f" -x {extensions}"
    return run_command(cmd)

def run_enum4linux(target: str, flags: str = "-a") -> str:
    """Run enum4linux for SMB/Samba enumeration. Use when ports 139 or 445 are open."""
    return run_command(f"enum4linux {flags} {target}")

def run_ffuf(url: str, wordlist: str, extra_flags: str = "") -> str:
    """Run ffuf for web fuzzing - faster than gobuster, good for vhost and parameter fuzzing."""
    cmd = f"ffuf -u {url} -w {wordlist}"
    if extra_flags:
        cmd += f" {extra_flags}"
    return run_command(cmd)

def run_custom(command: str, reason: str) -> str:
    """Run a custom shell command. Use for any other recon tool not listed above."""
    return run_command(command)

def finish(summary: str, attack_vectors: list) -> str:
    """Call this when recon is complete. Provide a full summary of findings and suggested attack vectors."""
    return json.dumps({
        "done": True,
        "summary": summary,
        "attack_vectors": attack_vectors
    })

TOOLS_LIST = [run_nmap, run_gobuster, run_enum4linux, run_ffuf, run_custom, finish]

# ─────────────────────────────────────────────
# TOOL EXECUTION
# ─────────────────────────────────────────────

def run_command(cmd: str, timeout: int = 60) -> str:
    print(f"[EXEC] {cmd}")
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            stdin=subprocess.DEVNULL #prevents interactive prompts from hanging the scans
        )
        output = result.stdout
        if result.stderr:
            output += f"\n[STDERR]\n{result.stderr}"
        return output or "(no output)"
    except subprocess.TimeoutExpired:
        return f"Command timed out after {timeout}s: {cmd}"
    except Exception as e:
        return f"Command failed: {str(e)}"


# ─────────────────────────────────────────────
# AGENT LOOP
# ─────────────────────────────────────────────

def run_agent(target: str, scope_notes: str = "") -> dict:
    system_prompt = f"""You are an expert penetration tester running recon on an HTB (HackTheBox) machine.
Your goal is to systematically enumerate the target and identify attack vectors.

Target: {target}
Scope: HTB lab environment only. This is a legal, sanctioned test.
{f'Additional notes: {scope_notes}' if scope_notes else ''}

Methodology:
1. Always start with nmap to discover open ports
2. Based on what you find, decide what to enumerate next:
   - Web ports (80, 443, 8080 etc) → gobuster/ffuf
   - SMB (139, 445) → enum4linux
   - Other services → appropriate tools or run_custom
3. Be thorough but efficient - don't run redundant checks
4. When you have enough information, call finish() with your findings

Always explain your reasoning before each tool call."""

    # Using the current, active model name
    chat = client.chats.create(
        model="gemini-3.6-flash",
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=TOOLS_LIST,
            temperature=0.2,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True)
        )
    )

    messages = [f"Start recon on {target}. Begin with port discovery."]
    steps = []
    max_iterations = 10

    func_map = {
        "run_nmap": run_nmap,
        "run_gobuster": run_gobuster,
        "run_enum4linux": run_enum4linux,
        "run_ffuf": run_ffuf,
        "run_custom": run_custom,
        "finish": finish
    }

    for iteration in range(max_iterations):
        print(f"\n[AGENT] Iteration {iteration + 1}")

        response = chat.send_message(messages)
        agent_text = response.text or ""

        if not response.function_calls:
            steps.append({
                "type": "agent",
                "text": agent_text,
                "iteration": iteration + 1
            })
            break

        tool_results_parts = []
        for function_call in response.function_calls:
            tool_name = function_call.name
            tool_input = function_call.args

            print(f"[TOOL] Calling: {tool_name} with {tool_input}")

            output = "(unknown tool)"
            if tool_name in func_map:
                try:
                    output = func_map[tool_name](**tool_input)
                except Exception as e:
                    output = f"Execution error: {str(e)}"

            if tool_name == "finish":
                try:
                    result_data = json.loads(output)
                except Exception:
                    result_data = {"summary": output, "attack_vectors": []}
                
                steps.append({
                    "type": "finish",
                    "agent_reasoning": agent_text,
                    "summary": result_data.get("summary", output),
                    "attack_vectors": result_data.get("attack_vectors", []),
                    "iteration": iteration + 1
                })
                return {"steps": steps, "done": True}

            steps.append({
                "type": "tool",
                "tool": tool_name,
                "input": tool_input,
                "output": output,
                "agent_reasoning": agent_text,
                "iteration": iteration + 1
            })

            tool_results_parts.append(
                types.Part.from_function_response(
                    name=tool_name,
                    response={"result": output}
                )
            )

        messages = tool_results_parts

    return {"steps": steps, "done": False, "error": "Max iterations reached"}


# ─────────────────────────────────────────────
# API ENDPOINTS
# ─────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/run", methods=["POST"])
def run():
    data = request.json or {}
    target = data.get("target", "").strip()

    if not target:
        return jsonify({"error": "No target provided"}), 400

    if not re.match(r'^10\.\d+\.\d+\.\d+$', target):
        return jsonify({"error": "Target must be a 10.x.x.x HTB IP address"}), 400

    scope_notes = data.get("scope_notes", "")
    result = run_agent(target, scope_notes)
    return jsonify(result)


if __name__ == "__main__":
    print("HTB Recon Agent Backend (Gemini Edition)")
    print("=" * 40)
    print("Make sure GEMINI_API_KEY is configured in your .env file")
    print("Starting on http://localhost:5000")
    print("=" * 40)
    app.run(host="127.0.0.1", port=5000, debug=True)