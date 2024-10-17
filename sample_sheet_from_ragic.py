#!/usr/bin/env python3

import os, sys, re
from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter
import logging as L
import json
from datetime import date
from pprint import pprint, pformat

from ragic import RagicClient
from aggregator import aggregator

def main(args):

    rc = RagicClient.connect_with_creds()

    if args.json_file:
        with open(args.json_file) as fh:
            run = json.load(fh)

            if run['Flowcell ID'] != args.flowcell_id:
                exit(f"JSON {args.json_file} has flowcell {run['Flowcell ID']},"
                     f" not {args.flowcell_id}")
    else:

        # Query a run by "Flowcell ID"
        ir_form = "sequencing/2"    # Illumina Run
        ir_field = "1000011"        # Flowcell ID field

        query = f"{ir_field},eq,{args.flowcell_id}"
        runs = rc.list_entries(ir_form, query)

        L.debug("Found {len(runs)} record in Ragic.")
        if not runs:
            exit(f"No record of flowcell ID {args.flowcell_id}")

        # If there are multiple runs, pick the one with the highest number
        max_record_num = sorted(runs, key=lambda p: int(p))[-1]
        run = runs[max_record_num]

    print(*gen_ss(run), sep="\n")

def mdydate():
    """Get today's date in silly mm/dd/yyyy format
    """
    return date.today().strftime("%m/%d/%Y")

def gen_ss(run):
    """Turn that thing into a sample sheet let's gooooo!
    """
    #return([pformat(run)])

    res = aggregator(ofs=",")

    # Header
    res( "[Header]" )
    res( "IEMFileVersion", "4" )
    res( "Investigator Name", run['Investigator'] )
    res( "Experiment Name", run['Experiment'] )
    res( "Date", mdydate() )
    res( "Workflow", "GenerateFASTQ" )
    res( "Application", "FASTQ Only" )
    #res( "Assay", "TruSeq DNA" )
    res( "Chemistry", run['Chemistry'])
    res( *( ["#index_revcomp"] + [run[f'Lane {n} index revcomp'] for n in "1234"] ) )

    # Read lengths
    res()
    res( "[Reads]" )
    res( run['R1 Cycles'] )
    res( run['R2 Cycles'] )

    # Settings
    res()
    res( "[Settings]" )
    # Nothing here just now.

    # My special bcl2fastq stuff
    res()
    res( "[bcl2fastq]" )

    # There may be a neater way to do this but the lanes correspond to the subtables,
    # and I think I can just assume the keys are in order, or else maybe I order on
    # '_header_Y'.
    lane_keys = sorted([k for k in run if k.startswith("_subtable_")])

    res()
    res( "[Data]" )
    res( "Lane", "Sample_ID", "Sample_Name", "Sample_Plate", "Sample_Well",
         "Sample_Project", "I5_Index_ID", "index", "I7_Index_ID", "index2",
         "Description" )
    for lane_idx, lane_key in enumerate(lane_keys):
        for run_elem in tabulate_lane(lane_idx+1, lane=run[lane_key],
                                                  fcid=run['Flowcell ID'] ):
            res(run_elem)

    #with open(f"run_{run['Flowcell ID']}.json", "x") as fh:
    #    json.dump(run, fh)
    return res

def tabulate_lane(lane_num, lane, fcid, ):
    """lane_num is the lane number (lane_idx+1)
       lane is a subtable dict from the Ragic record
    """
    res = aggregator(ofs=",")

    # The items are keyed by unpadded integers-as-strings, so I need to do
    # a special numerical sort.
    run_elem_keys = sorted(lane, key=lambda k: int(k))

    for k in run_elem_keys:
        rel = lane[k]
        proj = rel['Library'][0:5]
        pool = rel['Pool'] or 'NoPool'

        index1 = "AAAAA"
        index2 = "TTTTT"

        res( lane_num,
             f"{pool}__{rel['Library']}",
             "", # Sample_Name
             fcid,
             "", # Sample_Well
             proj, # Sample_Project
             f"{proj}-{index1}",
             index1,
             f"{proj}-{index2}",
             index2,
             rel['Pool'], # May be blank if no pool
        )

    return res

def parse_args(*args):
    description = """This script builds an Illumina sample sheet from info in the Ragic.
                  """
    argparser = ArgumentParser( description=description,
                                formatter_class = ArgumentDefaultsHelpFormatter )
    argparser.add_argument("-f", "--flowcell_id", required=True,
                            help="The flowcell ID to look up.")
    argparser.add_argument("-j", "--json_file",
                            help="Load directly from JSON, skipping Ragic query.")

    return argparser.parse_args(*args)


if __name__ == "__main__":
    args = parse_args()
    L.basicConfig(level=L.INFO, stream=sys.stderr)
    main(args)
