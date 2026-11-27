#!/usr/bin/env python3
"""Serves the repository root, or the folder given (tools/serve.py dist), on 127.0.0.1 (PORT, default
8765) with the types _headers gives the host: Markdown and the text files for language models as UTF-8."""
import functools
import http.server
import os
import sys

TYPES = {'.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8'}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TYPES}


root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
port = int(os.environ.get('PORT', '8765'))
server = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=root))
print(f'Serving {root} on http://127.0.0.1:{port}/')
server.serve_forever()
