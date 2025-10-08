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
                response = requests.get(url, timeout=30)
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
        "software engineer",
        "software developer",
        "SWE",
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
