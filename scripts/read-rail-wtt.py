"""Read Network Rail's XLSX cell grid without an Excel runtime or third-party packages."""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def read_wtt(path, weekends=False):
    with zipfile.ZipFile(path) as archive:
        strings = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = ["".join(item.itertext()) for item in strings]
        links = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {link.attrib["Id"]: link.attrib["Target"] for link in links}
        book = ET.fromstring(archive.read("xl/workbook.xml"))
        sheets = {}
        for sheet in book.find("s:sheets", NS):
            name = sheet.attrib["name"]
            if not name.startswith("Mondays to Fridays") and not (weekends and name.startswith("Saturdays")):
                continue
            target = targets[sheet.attrib[f"{{{REL}}}id"]]
            xml = ET.fromstring(archive.read(target.lstrip("/") if target.startswith("/") else "xl/" + target))
            rows = []
            for row in xml.findall("s:sheetData/s:row", NS):
                index = int(row.attrib["r"]) - 1
                while len(rows) <= index:
                    rows.append([])
                for cell in row:
                    col = 0
                    for letter in re.match(r"[A-Z]+", cell.attrib["r"])[0]:
                        col = col * 26 + ord(letter) - 64
                    while len(rows[index]) < col:
                        rows[index].append("")
                    value = cell.find("s:v", NS)
                    text = value.text if value is not None else ""
                    if cell.attrib.get("t") == "s":
                        text = shared[int(text)]
                    elif cell.attrib.get("t") == "inlineStr":
                        text = "".join(cell.find("s:is", NS).itertext())
                    rows[index][col - 1] = text or ""
            sheets[name] = rows
        return sheets


if __name__ == "__main__":
    print(json.dumps(read_wtt(sys.argv[1], "--all-days" in sys.argv)))
