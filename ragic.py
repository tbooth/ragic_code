import os, sys, re

import urllib.parse
import urllib.request
import configparser
import json
import shutil
from pprint import pprint, pformat

import logging
L = logging.getLogger(__name__)

# Basic client for the Ragic API - see
# https://github.com/ragic/public/blob/master/HTTP%20API%20Sample/Python-Sample/read.py
# This client has no extra dependencies - just Py3 standard lib

class RequestError(RuntimeError):
    pass

class EmptyResultError(RuntimeError):
    pass

class RagicClient:

    def __init__(self, server_url, forms=None):

        # Server may or may not have https:// part
        if '://' in server_url:
            self.server_url = server_url
        else:
            self.server_url = f"https://{server_url}"

        self.forms = dict()
        if forms:
            self.add_forms(forms)

        self.http_timeout = 30

    def connect(self, account_name, api_key):
        """Not really a connection as the API is stateless.
        """
        self.account_name = account_name
        self.api_key = api_key

        # To allow chaining
        return self

    def add_forms(self, new_forms):
        """Tell the client about some forms.
        """
        # FIXME - if I ever publish this code I should probably deep-copy the dict.
        self.forms.update(new_forms)

    @classmethod
    def connect_with_creds(cls, ini_section="ragic"):
        """Use ~/.ragic_api to connect
        """
        config = configparser.ConfigParser()
        conf_file = config.read(os.environ.get('RAGICAPIFILE',
                                [os.path.expanduser('~/.ragic_api'), 'ragic_api.conf']))

        assert conf_file, "No config file found for Ragic API credentials"
        res = config[ini_section]

        return cls(res['server']).connect( account_name = res['account'],
                                           api_key = res['key'] )

    def list_entries(self, sheet, query=None, subtables=True, latest_n=None):
        """Search for entries by query.
           Query may be a list of '{field},{op},{val}' strings, where
           field may be the ID or else the name of the field in the forms dict.

           latest_n only returns the N most recently updated records, newest first.
        """
        sheet_info = None
        if self.forms:
            sheet_info = self.forms[sheet]
            sheet = sheet_info['_form']
        listing_page = self._get_page_url(sheet)

        params = {}
        if query:
            # Replace the named fields
            if sheet_info:
                if isinstance(query, str):
                    query = [query]

                query = [ self._munge_query(q, sheet_info)
                          for q in query ]

            params['where'] = query
        if not subtables:
            params['subtables'] = '0'

        if latest_n:
            # Used to obtain only the N most recent records
            params['limit'] = str(latest_n)
            params['order'] = f"{sheet_info['_date_field']},DESC"

        return self._get_json(listing_page, params)

    def get_page(self, sheet, record_id):
        """Fetch a specific record by ID
        """
        if self.forms:
            sheet = self.forms[sheet]['_form']
        entry_page = self._get_page_url(sheet, record_id)

        # TODO - since I have self.forms I should be able to query with naming=EID
        # and then convert the codes to names. This makes the API calls robust to
        # field renaming.

        return self._get_json(entry_page)

    def post_update(self, sheet, record_id, update_items):
        """Save new items into a page.
        """
        if self.forms:
            sheet_info = self.forms[sheet]
            sheet = sheet_info['_form']

            # I also need to translate the dict keys into IDs
            update_items = { sheet_info[k]: v for k, v in update_items.items() }

        entry_page = self._get_page_url(sheet, record_id)

        json_resp = self._post_json(entry_page, update_items)

        # In Ragic, we can have a 200 response but the update may still have been rejected,
        # so check the 'status' AND the 'msg' field.
        L.debug(pformat(json_resp))
        if json_resp['status'] != "SUCCESS" or json_resp['msg'] != "&nbsp;":
            raise RequestError(f"{json_resp['status']} {json_resp['msg']}")

        return json_resp

    def get_data_dict(self, destfile):
        """Download the data dictionary

           HTML will be saved out to destfile
        """
        # TODO - this is just messing around at the moment. We get the data dictionary
        # as a human-readable HTML page. Ideally we want this as JSON, but scraping it
        # for the field names and numbers is going to be pretty easy. The idea would be that
        # I could then dump the forms dict to a JSON file rather than manually adding it at the
        # top of my code.
        url = f"{self.server_url}/sims/doc.jsp"
        params = dict(a=self.account_name)
        req = urllib.request.Request( method = "GET",
                                      url = f"{url}?{urllib.parse.urlencode(params)}",
                                      headers = self._get_headers() )
        with urllib.request.urlopen( url = req,
                                     timeout = self.http_timeout ) as resp:
            if resp.status != 200:
                raise RequestError(f"{resp.status} {resp.reason}")

            with open(destfile, "wb") as dfh:
                shutil.copyfileobj(resp, dfh)

            return resp.status

    def get_javascript_code(self, sheet, destfile):
        """Grab a copy of the current code for a sheet.
           Actually, this isn't going to work without the session cookie, and without
           it you just get back a zero byte response, so I'll have to settle for copy/paste
           to save may changes into GIT.
        """
        # Not sure if this is right?
        sheet_num = sheet.split("/")[-1]

        url = f"{self.server_url}/sims/txtedit.jsp"
        params = dict( paramLoc = f"cust/def/app/{self.account_name}/"
                                  f"{sheet}_Sheet{sheet_num}_index.nui")

        headers = {'Content-Type': 'text/html',
                   'Accept-Encoding': 'gzip'}
        req = urllib.request.Request( method = "GET",
                                      url = f"{url}?{urllib.parse.urlencode(params)}",
                                      headers = self._get_headers(**headers) )

        with urllib.request.urlopen( url = req,
                                     timeout = self.http_timeout ) as resp:
            if resp.status != 200:
                raise RequestError(f"{resp.status} {resp.reason}")

            if not int(resp.headers['Content-Length']):
                raise RequestError(f"Content length is 0")

            with open(destfile, "wb") as dfh:
                shutil.copyfileobj(resp, dfh)

            return resp.status


    def _munge_query(self, query, mapping):
        """Fix queries where the first part is a named field by using the mapping.
        """
        query_bits = query.split(",")
        query_bits[0] = mapping[query_bits[0]]
        return ",".join(query_bits)

    def _get_json(self, url, params=None):
        """Get a URL with all the right credentials and headers
        """
        params = self._encode_params(params)

        req = urllib.request.Request( method = "GET",
                                      url = f"{url}?{params}",
                                      headers = self._get_headers() )
        with urllib.request.urlopen( url = req,
                                     timeout = self.http_timeout ) as resp:
            if resp.status != 200:
                raise RequestError(f"{resp.status} {resp.reason}")

            return json.load(resp)

    def _post_json(self, url, json_data, params=None):
        """Post an update with all the right credentials and headers.
        """
        params = self._encode_params(params)

        headers = {'Content-Type': 'application/json'};
        req = urllib.request.Request( method = "POST",
                                      url = f"{url}?{params}",
                                      headers = self._get_headers(**headers) )
        with urllib.request.urlopen( url = req,
                                     data = json.dumps(json_data).encode(),
                                     timeout = self.http_timeout ) as resp:

            if resp.status != 200:
                raise RequestError(f"{resp.status} {resp.reason}")

            return json.load(resp)

    def _get_page_url(self, sheet, record_id=None):

        page = f"{self.server_url}/{self.account_name}/{sheet}"
        if record_id is not None:
            page += f"/{record_id}"

        return page

    def _encode_params(self, overrides):

        params = dict( api = "", v = "3" )
        params.update(overrides or ())
        return urllib.parse.urlencode(params, doseq=True)

    def _get_headers(self, **overrides):

        headers = dict( Authorization = f"Basic {self.api_key}" )
        headers.update(overrides)
        return headers

