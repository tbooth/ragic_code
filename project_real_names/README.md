# Project Real Names

A standalone script to get the real names of projects from the numbers. This is used in several
pipelines, so I'm making a standalone script to do it.

## Usage

To get the name for just one project, in plain format:

```
$ project_real_names.py -t 34551
```

To save the info into a YAML file:

```
$ project_real_names.py --yaml prn.yaml --update 34551 33720
```
