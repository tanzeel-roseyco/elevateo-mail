Set-Location 'C:\Users\Tanzeel\Code and projects\Elevateo Mail - Fable Frontend'
$brief=Get-Content 'output\frontend-agent-prompt.txt' -Raw
& 'C:\Users\Tanzeel\.local\bin\claude.exe' -p --model fable --effort high --permission-mode auto --output-format stream-json --verbose $brief > 'output\frontend-agent-events.jsonl' 2> 'output\frontend-agent-errors.log'
$LASTEXITCODE | Set-Content 'output\frontend-agent-exit.txt'
