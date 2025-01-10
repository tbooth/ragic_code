#!/usr/bin/env python3

import sys, os, re
import unittest
import logging
from unittest.mock import patch

from project_real_names import project_real_names, gen_url, RagicClient, SampleSheetReader

BASEDIR = os.path.abspath( os.path.dirname(__file__) )

class T(unittest.TestCase):

    ALWAYS_PATCH = ("project_real_names.RagicClient",)

    def setUp(self):
        # See the errors in all their glory
        self.maxDiff = None

        logging.getLogger().setLevel(logging.CRITICAL)

        # Always patch RagicClient
        self.patchers = { p: patch(p) for p in self.ALWAYS_PATCH }
        self.mocks = {}
        for p, patcher in self.patchers.items():
            self.mocks[p] = patcher.start()

    def tearDown(self):
        for p, patcher in self.patchers.items():
            patcher.stop()
            del self.mocks[p]

    ### THE TESTS ###
    def test_name_list_lookup(self):
        """Test the name lookup logic, with a name list.
        """
        res = project_real_names(['123', '456'], name_list='123_Example_Project')

        # Add the URLs as the script does
        for v in res.values():
            v['url'] = gen_url(v, "T{}T")

        self.assertEqual( res,
                          { '123' : dict( name = "123_Example_Project",
                                          url = "T123_Example_ProjectT" ),
                            '456' : dict( name = "456_UNKNOWN",
                                          error = "not listed in PROJECT_NAME_LIST",
                                          url = "error: not listed in PROJECT_NAME_LIST" ),
                          })

    def test_ragic_lookup(self):
        """Test the Ragic query with the mocked RagicClient
        """
        mc = self.mocks['project_real_names.RagicClient']
        # The API call returns a dict but we only care about the .values()
        mc.connect_with_creds().list_entries.side_effect = [ {'x':
                        { '_ragicId': 1,
                          'Project Number': "00123",
                          'Project Name': "00123_Example_Project",
                        }
                    } ]

        res = project_real_names(['123', '456'])

        # Add the URLs as the script does
        for v in res.values():
            v['url'] = gen_url(v, "T{}T")

        self.assertEqual( res,
                          { '123' : dict( name = "00123_Example_Project",
                                          url = "T00123_Example_ProjectT" ),
                            '456' : dict( name = "456_UNKNOWN",
                                          error = "not listed in Ragic",
                                          url = "error: not listed in Ragic" ),
                          })

    def test_sheet_reader(self):
        """Test the sample sheet reader class
        """
        ssr = SampleSheetReader(f"{BASEDIR}/SampleSheet.1.csv")

        proj_numbers = set()
        for line in ssr.samplesheet_data:
            proj_numbers.add(line['sample_project'])

        self.assertEqual(sorted(proj_numbers), ['11285', '11354'])

if __name__ == '__main__':
    unittest.main()
