#!/usr/bin/env python3
"""
Mark Expired Jobs Script for Career Cardinal AI
This script marks jobs as expired based on their expiration dates
"""

import argparse
import sys
import requests
import json
from datetime import datetime


def mark_expired_jobs(base_url: str, dry_run: bool = False) -> dict:
    """
    Marks expired jobs as expired by calling the backend API
    
    Args:
        base_url (str): Base URL of the backend API
        dry_run (bool): If True, only shows what would be marked expired without actually doing it
    
    Returns:
        dict: Response from the API with count of expired jobs
    """
    endpoint = f"{base_url}/api/jobs/mark-expired"
    
    print(f"Backend: {base_url}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    print(f"Calling: {endpoint}")
    
    try:
        if dry_run:
            # For dry run, we'll check what jobs would be expired
            # by getting all jobs and checking their expiration dates
            response = requests.get(f"{base_url}/api/jobs", timeout=30)
            if response.status_code != 200:
                print(f"HTTP {response.status_code}: {response.text[:200]}")
                return {"error": "Failed to fetch jobs for dry run"}
            
            data = response.json()
            jobs = data.get("jobs", [])
            
            # Count jobs that would be expired
            current_time = datetime.now().isoformat()
            expired_count = 0
            
            for job in jobs:
                expires_at = job.get("expires_at")
                if expires_at and expires_at <= current_time:
                    expired_count += 1
                    print(f"Would expire: {job.get('title', 'Unknown')} at {job.get('company', 'Unknown')}")
            
            return {
                "message": "Dry run completed",
                "expired_count": expired_count,
                "total_jobs_checked": len(jobs)
            }
        else:
            # Live run - actually mark expired jobs
            response = requests.post(endpoint, timeout=30)
            if response.status_code != 200:
                print(f"HTTP {response.status_code}: {response.text[:200]}")
                return {"error": "Failed to mark expired jobs"}
            
            return response.json()
            
    except Exception as e:
        print(f"Error: {e}")
        return {"error": str(e)}


def get_job_stats(base_url: str) -> dict:
    """
    Gets statistics about jobs in the database
    
    Args:
        base_url (str): Base URL of the backend API
    
    Returns:
        dict: Job statistics
    """
    try:
        # Get total count
        count_response = requests.get(f"{base_url}/api/jobs/count", timeout=30)
        if count_response.status_code != 200:
            return {"error": "Failed to get job count"}
        
        count_data = count_response.json()
        total_jobs = count_data.get("total", 0)
        
        # Get sample of jobs to check status distribution
        jobs_response = requests.get(f"{base_url}/api/jobs?limit=100", timeout=30)
        if jobs_response.status_code != 200:
            return {"total_jobs": total_jobs, "error": "Failed to get job details"}
        
        jobs_data = jobs_response.json()
        jobs = jobs_data.get("jobs", [])
        
        # Count by status
        status_counts = {}
        for job in jobs:
            status = job.get("status", "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
        
        return {
            "total_jobs": total_jobs,
            "sample_size": len(jobs),
            "status_distribution": status_counts
        }
        
    except Exception as e:
        return {"error": str(e)}


def main(argv):
    """
    Main function to execute the mark expired jobs process
    
    Args:
        argv (list): Command line arguments
    
    Returns:
        int: Exit code (0 for success)
    """
    # Set up command line argument parser
    parser = argparse.ArgumentParser(description="Mark expired jobs as expired")
    parser.add_argument("--api-base", default="http://localhost:3000", help="Backend base URL")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be marked expired without actually doing it")
    parser.add_argument("--stats", action="store_true", help="Show job statistics before and after")
    
    # Parse command line arguments
    args = parser.parse_args(argv)
    
    # Show initial stats if requested
    if args.stats:
        print("=== BEFORE ===")
        stats = get_job_stats(args.api_base)
        if "error" in stats:
            print(f"Error getting stats: {stats['error']}")
        else:
            print(f"Total jobs: {stats['total_jobs']}")
            print(f"Status distribution: {stats['status_distribution']}")
        print()
    
    # Mark expired jobs
    result = mark_expired_jobs(args.api_base, args.dry_run)
    
    # Display results
    if "error" in result:
        print(f"Error: {result['error']}")
        return 1
    
    print(f"Result: {result.get('message', 'Completed')}")
    print(f"Expired jobs: {result.get('expired_count', 0)}")
    
    if args.dry_run:
        print(f"Total jobs checked: {result.get('total_jobs_checked', 0)}")
    
    # Show final stats if requested
    if args.stats:
        print("\n=== AFTER ===")
        stats = get_job_stats(args.api_base)
        if "error" in stats:
            print(f"Error getting stats: {stats['error']}")
        else:
            print(f"Total jobs: {stats['total_jobs']}")
            print(f"Status distribution: {stats['status_distribution']}")
    
    return 0


# Execute main function when script is run directly
if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
