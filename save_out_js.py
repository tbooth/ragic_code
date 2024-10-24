#!/usr/bin/env python3

# Save out the JS code for the Illumina Run sheet (sequencing/2)

from ragic import RagicClient

rc = RagicClient.connect_with_creds()

rc.get_javascript_code("sequencing/2", "Illumina_Run.js")
