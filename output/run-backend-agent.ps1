Set-Location 'C:\Users\Tanzeel\Code and projects\Elevateo Mail - Backend'
Get-Content 'output\backend-agent-prompt.txt' -Raw | & 'C:\Users\Tanzeel\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe' exec -m gpt-6.1-sol -c 'model_reasoning_effort="low"' -c 'service_tier="priority"' -s workspace-write --json -o 'output\backend-agent-final.txt' - > 'output\backend-agent-events.jsonl' 2> 'output\backend-agent-errors.log'
$LASTEXITCODE | Set-Content 'output\backend-agent-exit.txt'
