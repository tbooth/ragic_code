#!/usr/bin/env python3

import os, sys, re
from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter

from ragic import RagicClient

def main(args):

    rc = RagicClient.connect_with_creds()

    # Query a run by "Flowcell ID"
    ir_form = "sequencing/2"    # Illumina Run
    ir_field = "1000011"        # Flowcell ID field

    # Note - we should url-encode args.project_number but here we know it's only digits

    # TODO - make the client do this encoding for us
    # TODO - convert the client to not use "requests"
    query = f"{ir_field},eq,{args.flowcell_id}"
    runs = rc.list_entries(ir_form, query)

    # If there are multiple runs, pick the one with the highest number
    max_record_num = sorted(runs, key=lambda p: int(p))[-1]
    run = runs[max_record_num]

    print(run['Experiment'])


def parse_args(*args):
    description = """This script builds an Illumina sample sheet from info in the Ragic.
                  """
    argparser = ArgumentParser( description=description,
                                formatter_class = ArgumentDefaultsHelpFormatter )
    argparser.add_argument("-f", "--flowcell_id", required=True,
                            help="The flowcell ID to look up.")

    return argparser.parse_args(*args)


if __name__ == "__main__":
    args = parse_args()
    main(args)
