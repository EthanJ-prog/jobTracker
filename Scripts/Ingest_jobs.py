# Import required libraries
import argparse  # For parsing command line arguments
import sys      # For system-specific parameters and functions
import time     # For adding delays between API calls
from urllib.parse import urlencode  # For URL encoding parameters
import requests # For making HTTP requests

def build_url(base_url: str, query: str, page: int, country: str, date_posted: str) -> str:
    """
    Constructs the API URL with query parameters
    
    Args:
        base_url: The base URL of the API
        query: Search term for jobs
        page: Page number for pagination
        country: Country code to filter jobs
        date_posted: Time filter for job postings
    
    Returns:
        Complete URL string with encoded parameters
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
    Fetches job data from the API for multiple queries and pages
    
    Args:
        base_url: API base URL
        queries: List of search terms
        start_page: Starting page number
        pages: Number of pages to fetch
        country: Country code filter
        date_posted: Time filter
        delay_sec: Delay between API calls
    
    Returns:
        Total number of jobs processed
    """
    total = 0
    # Loop through each search query
    for q in queries:
        # Loop through specified number of pages
        for p in range(start_page, start_page + pages):
            url = build_url(base_url, q, p, country, date_posted)
            print(f"Ingesting: query='{q}', page={p}, country={country}, date_posted={date_posted}") 
            
            try:
                # Make API request with timeout
                resp = requests.get(url, timeout=30)
                if resp.status_code != 200:
                    print(f"HTTP {resp.status_code}: {resp.text[:200]}") 
                    continue
                    
                # Process response data
                data = resp.json()
                count = int(data.get("count", 0))
                print(f"Upserted/processed {count} jobs")
                total += count
                
            except Exception as e:
                print(f"Error: {e}")
                
            # Add delay between requests if specified
            if delay_sec > 0:
                time.sleep(delay_sec)
    return total

def main(argv):
    """
    Main function to handle command line arguments and run the job ingestion
    
    Args:
        argv: Command line arguments
    
    Returns:
        Exit code (0 for success)
    """
    # Set up command line argument parser
    parser = argparse.ArgumentParser(description="Batch-ingest jobs via backend ingest endpoint")
    parser.add_argument("--api-base", default="http://localhost:3000", help="Backend base URL")
    parser.add_argument("--query", action="append")
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--pages", type=int, default=3)
    parser.add_argument("--country", default="us", help="Country code")
    parser.add_argument("--date-posted", default="week", help="Date filter")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay between calls")

    # Parse command line arguments
    args = parser.parse_args(argv)

    # Default search queries if none provided
    queries = args.query if args.query else [
        "software engineer",
        "software developer",
        "SWE",
    ]

    print(f"Backend: {args.api_base} | queries={queries}")

    # Run the job ingestion
    total = ingest_queries(
        base_url=args.api_base, 
        queries=queries,
        start_page=args.start_page,
        pages=args.pages,
        country=args.country,
        date_posted=args.date_posted,
        delay_sec=args.delay, 
    )

    print(f"Done. Processed {total} jobs across all calls.")
    return 0

# Entry point of the script
if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))


