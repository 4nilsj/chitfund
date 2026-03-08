import os
import glob

# Recursive glob across all views
for filepath in glob.glob('/Users/anilkumarjamadar/Desktop/API Scanner/chitfund/views/**/*.ejs', recursive=True):
    with open(filepath, 'r') as f:
        text = f.read()
        
    changed = False

    # Fix search === or search ||
    if '<%= search' in text and '<%= typeof search !== \'undefined\' ? search : \'\'' not in text:
        text = text.replace("<%= search || '' %>", "<%= typeof search !== 'undefined' ? search : '' %>")
        changed = True

    # Fix statusFilter === 
    if '<%=statusFilter===' in text:
        text = text.replace("<%=statusFilter==='all' ? 'selected' : '' %>", "<%= typeof statusFilter !== 'undefined' && statusFilter === 'all' ? 'selected' : '' %>")
        text = text.replace("<%=statusFilter==='active' ? 'selected' : '' %>", "<%= typeof statusFilter !== 'undefined' && statusFilter === 'active' ? 'selected' : '' %>")
        text = text.replace("<%=statusFilter==='closed' ? 'selected' : '' %>", "<%= typeof statusFilter !== 'undefined' && statusFilter === 'closed' ? 'selected' : '' %>")
        changed = True
        
    if changed:
        with open(filepath, 'w') as f:
            f.write(text)
        print(f"Fixed {filepath}")
