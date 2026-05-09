# Job data ingestion script for Career Cardinal AI
# This script fetches job listings from the backend API and processes them in batches

import argparse
import sys 
import time
from urllib.parse import urlencode 
import requests


def build_url(base_url: str, query: str, page: int, country: str, date_posted: str) -> str:
    """
    Builds the API URL for job search requests
    
    Args:
        base_url (str): Base URL of the backend API
        query (str): Search term for job listings
        page (int): Page number for pagination
        country (str): Country code for job search
        date_posted (str): Date filter for job postings
    
    Returns:
        str: Complete URL with encoded query parameters
    """
    params = {
        "query": query, 
        "page": page, 
        "country": country, 
        "date_posted": date_posted,
    }
    return f"{base_url}/api/jobs/search?{urlencode(params)}"

def ingest_queries(
        base_url,
        queries,
        start_page,
        pages,
        country,
        date_posted,
        delay_sec,
):
    """
    Ingests job data by making API calls for multiple queries and pages
    
    Args:
        base_url (str): Base URL of the backend API
        queries (list): List of search queries to execute
        start_page (int): Starting page number for pagination
        pages (int): Number of pages to fetch per query
        country (str): Country code for job search
        date_posted (str): Date filter for job postings
        delay_sec (float): Delay between API calls in seconds
    
    Returns:
        int: Total number of jobs processed across all queries
    """
    total = 0
    
    # Iterate through each query
    for query in queries:
        # Iterate through each page for the current query
        for page in range(start_page, start_page + pages):
            url = build_url(base_url, query, page, country, date_posted)
            print(f"Ingesting: query='{query}', page={page}, country={country}, date_posted={date_posted}") 
            
            try:
                # Make API request with timeout
                response = requests.get(url, timeout=600)
                if response.status_code != 200:
                    print(f"HTTP {response.status_code}: {response.text[:200]}") 
                    continue
                
                # Parse response and count processed jobs
                data = response.json()
                count = int(data.get("count", 0))
                print(f"Upserted/processed {count} jobs")
                total += count
            except Exception as e:
                print(f"Error: {e}")
            
            # Rate limiting - wait between requests to avoid overwhelming the API
            if delay_sec > 0:
                time.sleep(delay_sec)
    
    return total


def main(argv):
    """
    Main function to execute the job ingestion process
    Parses command line arguments and orchestrates the ingestion workflow
    
    Args:
        argv (list): Command line arguments
    
    Returns:
        int: Exit code (0 for success)
    """
    # Set up command line argument parser
    parser = argparse.ArgumentParser(description="Batch-ingest jobs via backend ingest endpoint")
    parser.add_argument("--api-base", default="http://localhost:3000", help="Backend base URL")
    parser.add_argument("--query", action="append", help="Search query (can be specified multiple times)")
    parser.add_argument("--start-page", type = int, default = 1, help="Starting page number")
    parser.add_argument("--pages", type = int, default = 3, help="Number of pages to fetch per query")
    parser.add_argument("--country", default="us", help="Country code for job search")
    parser.add_argument("--date-posted", default="week", help="Date filter for job postings")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between API calls in seconds")

    # Parse command line arguments
    args = parser.parse_args(argv)

    # Set default queries if none provided
    queries = args.query if args.query else [
        # Technology & Software Development
        "software engineer",
        "software developer",
        "frontend developer",
        "backend developer",
        "full stack developer",
        "mobile app developer",
        "ios developer",
        "android developer",
        "web developer",
        "javascript developer",
        "python developer",
        "java developer",
        "c# developer",
        "php developer",
        "ruby developer",
        "go developer",
        "rust developer",
        "devops engineer",
        "site reliability engineer",
        "systems administrator",
        "database administrator",
        "cloud engineer",
        "aws engineer",
        "azure engineer",
        "gcp engineer",
        
        # Data & Analytics
        "data analyst",
        "data scientist",
        "data engineer",
        "business intelligence analyst",
        "data visualization specialist",
        "machine learning engineer",
        "ai engineer",
        "deep learning engineer",
        "computer vision engineer",
        "nlp engineer",
        "quantitative analyst",
        "research scientist",
        
        # Product & Design
        "product manager",
        "product owner",
        "product analyst",
        "ux designer",
        "ui designer",
        "ux/ui designer",
        "graphic designer",
        "product designer",
        "interaction designer",
        "user experience researcher",
        "design systems designer",
        
        # Project & Program Management
        "project manager",
        "program manager",
        "scrum master",
        "agile coach",
        "technical project manager",
        "product operations manager",
        "operations manager",
        
        # Business & Strategy
        "business analyst",
        "business development manager",
        "strategy consultant",
        "management consultant",
        "business operations analyst",
        "growth hacker",
        "market research analyst",
        
        # Marketing & Sales
        "marketing specialist",
        "digital marketing manager",
        "content marketing manager",
        "seo specialist",
        "social media manager",
        "brand manager",
        "marketing coordinator",
        "sales representative",
        "account executive",
        "business development representative",
        "sales development representative",
        "customer success manager",
        "account manager",
        
        # Finance & Accounting
        "financial analyst",
        "investment analyst",
        "financial planner",
        "accountant",
        "auditor",
        "tax specialist",
        "fp&a analyst",
        "corporate finance analyst",
        "credit analyst",
        
        # Human Resources
        "human resources coordinator",
        "hr generalist",
        "talent acquisition specialist",
        "recruiter",
        "hr business partner",
        "people operations manager",
        "training coordinator",
        "employee relations specialist",
        
        # Operations & Administration
        "operations coordinator",
        "administrative assistant",
        "executive assistant",
        "office manager",
        "facilities coordinator",
        "supply chain analyst",
        "logistics coordinator",
        "procurement specialist",
        
        # Customer Service & Support
        "customer service representative",
        "technical support specialist",
        "customer success specialist",
        "client services manager",
        "support engineer",
        
        # Education & Training
        "technical trainer",
        "instructional designer",
        "e-learning developer",
        "corporate trainer",
        
        # Research & Development
        "research assistant",
        "r&d engineer",
        "innovation specialist",
        
        # Quality Assurance
        "quality assurance analyst",
        "qa engineer",
        "test engineer",
        "automation engineer",
        "quality control inspector",
        
        # Entry-level & Internship Opportunities
        "intern",
        "internship",
        "entry level",
        "junior developer",
        "junior analyst",
        "graduate program",
        "rotational program",
        
        # Freelance & Contract
        "freelance",
        "contract",
        "consultant",
        "independent contractor",
        
        # Other Opportunities
        "volunteer",
        "part time",
        "temporary",
        "seasonal",
        "clerk",
        "assistant",
        "coordinator",
        "specialist",
        "associate",
    ]

    # Display configuration
    print(f"Backend: {args.api_base} | queries={queries}")

    # Execute job ingestion process
    total = ingest_queries(
        base_url=args.api_base, 
        queries=queries,
        start_page=args.start_page,
        pages=args.pages,
        country=args.country,
        date_posted=args.date_posted,
        delay_sec=args.delay, 
    )

    # Display final results
    print(f"Done. Processed {total} jobs across all calls.")
    return 0

# Execute main function when script is run directly
if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
