import os

filepath = '/Users/anilkumarjamadar/Desktop/API Scanner/chitfund/views/loans.ejs'
with open(filepath, 'r') as f:
    lines = f.readlines()

# Extract the table.
# Check line indices safely
start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if '<!-- Loans Table -->' in line:
        start_idx = i
        break

if start_idx != -1:
    # Find the next </div> that matches this level.
    # We'll just look for the end of the pagination block.
    # The pagination block ends with <% } %> then </div>
    for i in range(start_idx, len(lines)):
        if '</div>' in lines[i] and '</div>' in lines[i+1] and '</main>' in lines[i+2]:
            end_idx = i
            break

print(f"Start: {start_idx}, End: {end_idx}")

table_content_lines = lines[start_idx+1:end_idx] # ignore the <!-- Loans Table --> comment from the partial
partial_content = ''.join(table_content_lines)

# Inject sorting attributes
# Column ID
partial_content = partial_content.replace(
'''<th class="py-4 px-4">ID\n                                                                                                </th>''',
'''<th data-sortable="true" data-column="id" data-sort-dir="<%= typeof sortBy !== 'undefined' && sortBy === 'id' ? sortDir : '' %>"\n                                                                                                    class="py-4 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">\n                                                                                                    ID\n                                                                                                    <i class="fas fa-sort<%= typeof sortBy !== 'undefined' && sortBy === 'id' ? (sortDir === 'asc' ? '-up' : '-down') : '' %> ml-1"></i>\n                                                                                                </th>'''
)

# Column Borrower
partial_content = partial_content.replace(
'''<th class="py-4 px-4">\n                                                                                                    Borrower</th>''',
'''<th data-sortable="true" data-column="borrower_name" data-sort-dir="<%= typeof sortBy !== 'undefined' && sortBy === 'borrower_name' ? sortDir : '' %>"\n                                                                                                    class="py-4 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">\n                                                                                                    Borrower\n                                                                                                    <i class="fas fa-sort<%= typeof sortBy !== 'undefined' && sortBy === 'borrower_name' ? (sortDir === 'asc' ? '-up' : '-down') : '' %> ml-1"></i>\n                                                                                                </th>'''
)

# Column Amount
partial_content = partial_content.replace(
'''<th class="py-4 px-4">\n                                                                                                    Amount</th>''',
'''<th data-sortable="true" data-column="amount" data-sort-dir="<%= typeof sortBy !== 'undefined' && sortBy === 'amount' ? sortDir : '' %>"\n                                                                                                    class="py-4 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">\n                                                                                                    Amount\n                                                                                                    <i class="fas fa-sort<%= typeof sortBy !== 'undefined' && sortBy === 'amount' ? (sortDir === 'asc' ? '-up' : '-down') : '' %> ml-1"></i>\n                                                                                                </th>'''
)

# Column EMI
partial_content = partial_content.replace(
'''<th class="py-4 px-4">\n                                                                                                    EMI</th>''',
'''<th data-sortable="true" data-column="emi" data-sort-dir="<%= typeof sortBy !== 'undefined' && sortBy === 'emi' ? sortDir : '' %>"\n                                                                                                    class="py-4 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">\n                                                                                                    EMI\n                                                                                                    <i class="fas fa-sort<%= typeof sortBy !== 'undefined' && sortBy === 'emi' ? (sortDir === 'asc' ? '-up' : '-down') : '' %> ml-1"></i>\n                                                                                                </th>'''
)

# Column Status
partial_content = partial_content.replace(
'''<th class="py-4 px-4">\n                                                                                                    Status</th>''',
'''<th data-sortable="true" data-column="status" data-sort-dir="<%= typeof sortBy !== 'undefined' && sortBy === 'status' ? sortDir : '' %>"\n                                                                                                    class="py-4 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">\n                                                                                                    Status\n                                                                                                    <i class="fas fa-sort<%= typeof sortBy !== 'undefined' && sortBy === 'status' ? (sortDir === 'asc' ? '-up' : '-down') : '' %> ml-1"></i>\n                                                                                                </th>'''
)

def unindent(text, amount=80):
    res = []
    for line in text.split('\n'):
        if line.startswith(' ' * amount):
            res.append(line[amount:])
        elif line.startswith(' ' * (amount - 4)):
            res.append(line[amount-4:])
        else:
            res.append(line)
    return '\n'.join(res)

final_partial = unindent(partial_content, 80)

query_str = '''&<%= typeof search !== 'undefined' ? 'search=' + search : '' %>&<%= typeof statusFilter !== 'undefined' ? 'status=' + statusFilter : '' %>&<%= typeof sortBy !== 'undefined' ? 'sortBy=' + sortBy : '' %>&<%= typeof sortDir !== 'undefined' ? 'sortDir=' + sortDir : '' %>'''

final_partial = final_partial.replace(
    '''<a href="<%= pagination.baseUrl %>?page=<%= pagination.currentPage - 1 %>&<%= pagination.query %>"''',
    f'''<a href="<%= pagination.baseUrl %>?page=<%= pagination.currentPage - 1 %>{query_str}"'''
)
final_partial = final_partial.replace(
    '''<a href="<%= pagination.baseUrl %>?page=<%= pagination.currentPage + 1 %>&<%= pagination.query %>"''',
    f'''<a href="<%= pagination.baseUrl %>?page=<%= pagination.currentPage + 1 %>{query_str}"'''
)
final_partial = final_partial.replace(
    '''<a href="<%= pagination.baseUrl %>?page=<%= pagination.currentPage - 1 %>"''',
    f'''<a href="<%= pagination.baseUrl %>?page=<%= pagination.currentPage - 1 %>{query_str}"'''
)
final_partial = final_partial.replace(
    '''<a href="<%= pagination.baseUrl %>?page=<%= pagination.currentPage + 1 %>"''',
    f'''<a href="<%= pagination.baseUrl %>?page=<%= pagination.currentPage + 1 %>{query_str}"'''
)
final_partial = final_partial.replace(
    '''<a href="<%= pagination.baseUrl %>?page=<%= i %>"''',
    f'''<a href="<%= pagination.baseUrl %>?page=<%= i %>{query_str}"'''
)

with open('/Users/anilkumarjamadar/Desktop/API Scanner/chitfund/views/partials/loan_table.ejs', 'w') as f:
    f.write(final_partial)


# Update loans.ejs
prefix = ''.join(lines[:start_idx+1])
suffix = ''.join(lines[end_idx:])

new_block = '''                                            <div id="data-table-container" class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden relative">
                                                <div class="table-wrapper">
                                                    <%- include('partials/loan_table') %>
                                                </div>
                                            </div>
'''

new_suffix = suffix.replace('</body>', '    <script src="/js/datatable.js"></script>\n</body>')

with open(filepath, 'w') as f:
    f.write(prefix + new_block + new_suffix)

print("Refactoring done")
