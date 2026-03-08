import re
import os

filepath = '/Users/anilkumarjamadar/Desktop/API Scanner/chitfund/views/partials/loan_table.ejs'
with open(filepath, 'r') as f:
    text = f.read()

# Replace sortBy === with typeof sortBy !== 'undefined' && sortBy ===
text = text.replace("<%= sortBy ===", "<%= typeof sortBy !== 'undefined' && sortBy ===")

# Replace statusFilter === with typeof statusFilter !== 'undefined' && statusFilter ===
text = text.replace("<%= statusFilter ===", "<%= typeof statusFilter !== 'undefined' && statusFilter ===")

with open(filepath, 'w') as f:
    f.write(text)
