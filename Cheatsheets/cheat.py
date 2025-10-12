# ====== PYTHON FUNDAMENTALS TO ADVANCED WEB DEVELOPMENT ======

# ----- 1. BASIC DATA TYPES -----
# Numbers
integer_example = 42
float_example = 3.14
complex_example = 3 + 4j

# Strings
name = "Python"
multiline = """
Multiple
lines
of text
"""

# String formatting
name = "Alice"
age = 25
# f-strings (modern, preferred)
print(f"{name} is {age} years old")
# .format() method
print("{} is {} years old".format(name, age))

# ----- 2. DATA STRUCTURES -----
# Lists (mutable, ordered)
languages = ["Python", "JavaScript", "Java"]
languages.append("Ruby")  # Add item
languages.pop()          # Remove last item
first_lang = languages[0]  # Access by index

# Tuples (immutable, ordered)
coordinates = (10, 20)
x, y = coordinates  # Tuple unpacking

# Dictionaries (key-value pairs)
job = {
    "title": "Software Engineer",
    "company": "Tech Corp",
    "salary": 100000
}
# Access values
print(job.get("title", "No title found"))  # Safe access with default

# Sets (unique, unordered)
unique_tags = {"python", "web", "api"}
unique_tags.add("database")
unique_tags.remove("api")

# ----- 3. CONTROL FLOW -----
# If statements
if age < 18:
    print("Minor")
elif age < 65:
    print("Adult")
else:
    print("Senior")

# Loops
# For loop
for item in languages:
    print(item)

# While loop
count = 0
while count < 5:
    count += 1

# List comprehension (compact for loops)
squares = [x*x for x in range(10)]
evens = [x for x in range(10) if x % 2 == 0]

# ----- 4. FUNCTIONS AND LAMBDAS -----
# Basic function
def calculate_salary(base: float, bonus: float = 0) -> float:
    """Calculate total salary including bonus"""
    return base + bonus

# Lambda (anonymous) functions
double = lambda x: x * 2
numbers = [1, 2, 3]
doubled = list(map(double, numbers))

# Decorators (function modifiers)
def timer(func):
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        print(f"Function took {time.time() - start} seconds")
        return result
    return wrapper

@timer
def slow_function():
    time.sleep(1)

# ----- 5. OBJECT-ORIENTED PROGRAMMING -----
class Job:
    def __init__(self, title: str, company: str):
        self.title = title
        self.company = company
    
    def display(self):
        return f"{self.title} at {self.company}"
    
    @property  # Getter decorator
    def description(self):
        return f"Position: {self.title}"

# Inheritance
class TechJob(Job):
    def __init__(self, title: str, company: str, tech_stack: list):
        super().__init__(title, company)
        self.tech_stack = tech_stack

# ----- 6. FILE OPERATIONS -----
# Reading files
with open("data.txt", "r") as file:
    content = file.read()

# Writing files
with open("output.txt", "w") as file:
    file.write("Hello World")

# JSON handling
import json

data = {"name": "Python", "type": "language"}
json_string = json.dumps(data)  # Convert to JSON string
parsed_data = json.loads(json_string)  # Parse JSON string

# ----- 7. ADVANCED CONCEPTS -----
# Generators (memory efficient iterators)
def number_generator(n):
    for i in range(n):
        yield i

# Context managers
from contextlib import contextmanager

@contextmanager
def timer_context():
    start = time.time()
    yield
    print(f"Operation took: {time.time() - start}")

# Async/Await (for concurrent operations)
import asyncio

async def fetch_job(url):
    # Simulated async API call
    await asyncio.sleep(1)
    return {"title": "Software Engineer"}

# ----- 8. WEB DEVELOPMENT SPECIFIC -----
# API Requests with error handling
def safe_api_call(url: str, retries: int = 3) -> dict:
    for attempt in range(retries):
        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)  # Exponential backoff

# Rate limiting decorator
def rate_limit(calls: int, period: float):
    def decorator(func):
        last_called = []
        def wrapper(*args, **kwargs):
            now = time.time()
            last_called[:] = [t for t in last_called if now - t < period]
            if len(last_called) >= calls:
                raise Exception("Rate limit exceeded")
            last_called.append(now)
            return func(*args, **kwargs)
        return wrapper
    return decorator

# ----- 9. TESTING -----
import unittest

class TestJobFunctions(unittest.TestCase):
    def test_job_creation(self):
        job = Job("Developer", "Tech Co")
        self.assertEqual(job.title, "Developer")

# ----- 10. DEBUGGING TIPS -----
# Built-in debugger
import pdb
# pdb.set_trace()  # Breakpoint (uncomment to use)

# Better printing for debugging
from pprint import pprint
complex_data = {"jobs": [{"title": "Dev", "skills": ["Python", "JS"]}]}
pprint(complex_data)  # Pretty prints nested structures

# ====== PYTHON BASICS FOR WEB SCRAPING AND API PROJECTS ======

# ----- 1. IMPORTING MODULES -----
# Modules are like toolboxes - import what you need
import random  # Built-in module
from datetime import datetime  # Import specific parts
import requests  # External module for HTTP requests

# ----- 2. FUNCTIONS -----
# Functions are reusable blocks of code
def greet(name: str) -> str:  # Type hints show expected types
    """
    Docstrings explain what functions do
    
    Args:
        name: Person to greet
    Returns:
        Greeting message
    """
    return f"Hello {name}!"

# ----- 3. ERROR HANDLING -----
# Try/except prevents crashes
try:
    result = 10 / 0  # This will fail
except ZeroDivisionError as e:
    print(f"Caught error: {e}")
except Exception as e:  # Catch any other errors
    print(f"Unexpected error: {e}")

# ----- 4. WORKING WITH APIs -----
# APIs let programs talk to each other
# Example API call:
def fetch_data(url: str) -> dict:
    try:
        response = requests.get(url, timeout=30)  # 30 second timeout
        response.raise_for_status()  # Raise error for bad status
        return response.json()  # Parse JSON response
    except requests.RequestException as e:
        print(f"API error: {e}")
        return {}

# ----- 5. COMMAND LINE ARGUMENTS -----
# Let users configure program behavior
import argparse

def setup_args():
    parser = argparse.ArgumentParser(description="Example script")
    # Add arguments with --name format
    parser.add_argument("--name", default="world", help="Name to greet")
    return parser.parse_args()

# ----- 6. URL HANDLING -----
from urllib.parse import urlencode

# Build URLs safely
params = {
    "search": "python jobs",
    "location": "remote"
}
url = f"https://api.example.com/search?{urlencode(params)}"

# ----- 7. RATE LIMITING -----
import time

def rate_limited_operation():
    """Prevent overwhelming APIs with too many requests"""
    time.sleep(1)  # Wait 1 second between operations
    # ... do something ...

# ----- 8. TYPE HINTS -----
from typing import List, Dict, Optional

def process_items(items: List[str]) -> Dict[str, int]:
    """Type hints make code easier to understand"""
    return {item: len(item) for item in items}

# ----- 9. SCRIPT ENTRY POINT -----
# This is how Python scripts usually start
if __name__ == "__main__":
    # Code here only runs if file is executed directly
    args = setup_args()
    print(greet(args.name))

# ----- 10. COMMON PATTERNS -----
# List comprehension
numbers = [1, 2, 3, 4, 5]
squares = [n * n for n in numbers]  # [1, 4, 9, 16, 25]

# Dictionary comprehension
word_lengths = {word: len(word) for word in ["cat", "dog", "bird"]}

# Error handling with context managers
with open("example.txt", "r") as file:  # File closes automatically
    content = file.read()

# ----- 11. BEST PRACTICES -----
# Use meaningful variable names
user_age = 25  # Good
a = 25        # Bad

# Add comments for complex logic
def calculate_total(items: List[Dict]) -> float:
    # Sum all item prices after applying individual discounts
    return sum(item["price"] * (1 - item["discount"]) for item in items)