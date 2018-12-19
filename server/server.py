''' Implements a VSCode language server for YARA '''
import asyncio
import json
import logging
from urllib.parse import unquote, urlsplit

import protocol as lsp

try:
    import yara
    HAS_YARA = True
except ModuleNotFoundError:
    logging.warning("yara-python not installed. Diagnostics will not be available")
    HAS_YARA = False


class YaraLanguageServer(object):
    def __init__(self):
        ''' Handle the details of the VSCode language server protocol '''
        self._encoding = "utf-8"
        self._eol=b"\r\n"
        self._logger = logging.getLogger("yara")
        self.num_clients = 0

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        '''React and respond to client messages

        :reader: asyncio StreamReader. The connected client will write to this stream
        :writer: asyncio.StreamWriter. The connected client will read from this stream
        '''
        current_id = 0
        current_workspace = {"config": None}
        has_shutdown = False
        has_started = False
        self._logger.info("Client connected")
        self.num_clients += 1
        while True:
            if reader.at_eof():
                self._logger.warning("Client has closed")
                self.num_clients -= 1
                break
            message = await self.read_request(reader)
            if "jsonrpc" in message:
                method = message.get("method", "")
                # this matches some kind of JSON-RPC message
                if "id" in message:
                    # if an id is present, this is a JSON-RPC request
                    current_id = message["id"]
                    if not has_started and method == "initialize":
                        self.workspace = urlsplit(unquote(message["params"]["rootUri"], encoding=self._encoding)).path
                        self._logger.info("Client workspace folder: %s", self.workspace)
                        client_options = message.get("params", {}).get("capabilities", {}).get("textDocument", {})
                        announcement = self.initialize(client_options)
                        await self.send_response(current_id, announcement, writer)
                    elif has_started and method == "shutdown":
                        self._logger.info("Client requested shutdown")
                        has_shutdown = True
                        await self.send_response(current_id, {}, writer)
                else:
                    # if no id is present, this is a JSON-RPC notification
                    self._logger.debug("Client sent a '%s' notification", method)
                    if method == "initialized":
                        self._logger.info("Client has been successfully initialized")
                        has_started = True
                        await self.send_notification("window/showMessageRequest", {"type": lsp.MESSAGETYPE_INFO, "message": "Successfully connected"}, writer)
                    elif has_started and method == "exit":
                        self._logger.info("Client requested exit")
                        proper_shutdown = 0 if has_shutdown else 1
                        await self.send_response(current_id, {"success": proper_shutdown}, writer)
                        await self.remove_client(writer)
                    elif has_started and method == "workspace/didChangeConfiguration":
                        current_workspace["config"] = message.get("params", {}).get("settings", {}).get("yara", {})
                        self._logger.debug("Changed workspace config to %s", json.dumps(current_workspace["config"]))
                        if current_workspace["config"].get("trace", {}).get("server", "off") == "on":
                            # add another logging handler to output DEBUG logs to VSCode's channel
                            self._logger.info("Ignoring trace request for now")
                    elif has_started and method == "textDocument/didOpen":
                        self._logger.debug("Ignoring textDocument/didOpen notification")
            else:
                # no idea what this message is, let the client know the server is shutting down improperly
                await self.send_error(lsp.PARSE_ERROR, current_id, "Could not parse message", writer)

    def initialize(self, client_options: dict) -> dict:
        ''' Announce language support methods '''
        server_options = {}
        if client_options.get("synchronization", {}).get("dynamicRegistration", False):
            # Documents are synced by always sending the full content of the document
            server_options["textDocumentSync"] = lsp.TRANSPORTKIND_FULL
        if client_options.get("completion", {}).get("dynamicRegistration", False):
            server_options["completionProvider"] = {
                # The server does not provide support to resolve additional information for a completion item
                "resolveProvider": False,
                "triggerCharacters": ["."]
            }
        if client_options.get("definition", {}).get("dynamicRegistration", False):
            server_options["definitionProvider"] = True
        if client_options.get("references", {}).get("dynamicRegistration", False):
            server_options["referencesProvider"] = True
        if client_options.get("documentHighlight", {}).get("dynamicRegistration", False):
            server_options["documentHighlightProvider"] = True
        if client_options.get("formatting", {}).get("dynamicRegistration", False):
            server_options["documentFormattingProvider"] = True
        if client_options.get("rename", {}).get("dynamicRegistration", False):
            server_options["renameProvider"] = True
        return {"capabilities": server_options}

    async def provide_code_completion(self) -> dict:
        ''' Respond to the completionItem/resolve request '''
        self._logger.warning("provide_code_completion() is not yet implemented")

    async def provide_definition(self) -> dict:
        ''' Respond to the textDocument/definition request '''
        self._logger.warning("provide_definition() is not yet implemented")

    async def provide_diagnostic(self) -> dict:
        ''' Respond to the textDocument/publishDiagnostics request
        The message carries an array of diagnostic items for a resource URI.
        '''
        self._logger.warning("provide_diagnostic() is not et implemented")
        if HAS_YARA:
            logging.debug("yara-python is installed")
        elif not HAS_YARA:
            self._logger.error("yara-python is not installed. Diagnostics are disabled")

    async def provide_highlight(self) -> dict:
        ''' Respond to the textDocument/documentHighlight request '''
        self._logger.warning("provide_highlight() is not implemented")

    async def provide_reference(self) -> dict:
        ''' Respond to the textDocument/references request '''
        self._logger.warning("provide_reference() is not yet implemented")

    async def provide_rename(self) -> dict:
        ''' Respond to the textDocument/rename request '''
        self._logger.warning("provide_rename() is not yet implemented")

    async def read_request(self, reader: asyncio.StreamReader) -> dict:
        ''' Read data from the client '''
        # we don't want handle_client() to deal with anything other than dicts
        request = {}
        data = await reader.readline()
        if data:
            self._logger.debug("header <= %r", data)
            key, value = tuple(data.decode(self._encoding).strip().split(" "))
            header = {key: value}
            # read the extra separator after the initial header
            await reader.readuntil(separator=self._eol)
            if key == "Content-Length:":
                data = await reader.readexactly(int(value))
            else:
                data = await reader.readline()
            self._logger.debug("input <= %r", data)
            request = json.loads(data.decode(self._encoding))
        return request

    async def remove_client(self, writer: asyncio.StreamWriter):
        ''' Close the cient input & output streams '''
        if writer.can_write_eof():
            await writer.write_eof()
        writer.close()
        await writer.wait_closed()
        self._logger.info("Disconnected client")

    async def send_error(self, code: int, curr_id: int, msg: str, writer: asyncio.StreamWriter):
        ''' Write back a JSON-RPC error message to the client '''
        message = json.dumps({
            "jsonrpc": "2.0",
            "id": curr_id,
            "error": {
                "code": code,
                "message": msg
            }
        }).replace(" ", "")
        await self.write_data(message, writer)

    async def send_notification(self, method: str, params: dict, writer: asyncio.StreamWriter):
        ''' Write back a JSON-RPC notification to the client '''
        message = json.dumps({
            "jsonrpc": "2.0",
            "method": method,
            "params": params
        }).replace(" ", "")
        await self.write_data(message, writer)

    async def send_response(self, curr_id: int, response: dict, writer: asyncio.StreamWriter):
        ''' Write back a JSON-RPC response to the client '''
        message = json.dumps({
            "jsonrpc": "2.0",
            "id": curr_id,
            "result": response,
        }).replace(" ", "")
        await self.write_data(message, writer)

    async def write_data(self, message: str, writer: asyncio.StreamWriter):
        ''' Write a JSON-RPC message to the given stream with the proper encoding and formatting '''
        message = message.encode(self._encoding)
        self._logger.debug("output => %r", message)
        writer.write("Content-Length: {:d}\r\n\r\n".format(len(message)).encode(self._encoding))
        await writer.drain()
        writer.write(message)
        await writer.drain()
