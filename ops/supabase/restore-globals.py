"""Make pg_dumpall CREATE ROLE idempotent only in an isolated fresh restore target."""
import pathlib, re, sys
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    if line.startswith('CREATE ROLE '):
        match = re.fullmatch(r'CREATE ROLE ([a-zA-Z_][a-zA-Z_0-9]*|"(?:[^"\n]|"")+");', line)
        if not match:
            raise ValueError('unsupported role identifier in globals dump')
        # Quoted identifiers can contain dollar delimiters; select one absent from the statement.
        tag = '$ops402$'
        while tag in line:
            tag = tag[:-1] + 'x$'
        print('DO ' + tag + ' BEGIN ' + line + ' EXCEPTION WHEN duplicate_object THEN NULL; END ' + tag + ';')
    else:
        print(line)
