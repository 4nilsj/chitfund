import glob
import os

files_to_fix = [
    'loan_detail.ejs',
    'payment_status.ejs',
    'interest_report.ejs',
    'passbook.ejs',
    'error.ejs'
]

for filename in files_to_fix:
    filepath = f'/Users/anilkumarjamadar/Desktop/API Scanner/chitfund/views/{filename}'
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            content = f.read()
        
        # 1. Replace outer container
        content = content.replace('<div class="app-container">', '<div class="flex h-screen overflow-hidden">')
        
        # 2. Fix inner wrapper to ensure md:ml-64 exists
        if '<main class="main-content"' in content and 'md:ml-64' not in content:
            content = content.replace('<main class="main-content"', '<main class="main-content md:ml-64 relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden"')
        elif '<main class="main-content">' in content:
            content = content.replace('<main class="main-content">', '<main class="main-content md:ml-64 relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">')

        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filename}")

