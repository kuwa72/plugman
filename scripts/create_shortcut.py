import struct
import os

def create_shortcut(target_path, lnk_path, working_dir=None, description=""):
    """
    Creates a basic Windows Shortcut (.lnk) file adhering to [MS-SHLLINK].
    target_path: e.g. "C:\\Users\\ykuwa\\AppData\\Local\\Programs\\Plugman\\Plugman.exe"
    lnk_path: destination path of .lnk file (POSIX or Windows path)
    """
    target_path = target_path.replace("/", "\\")
    if working_dir is None:
        working_dir = os.path.dirname(target_path)
    working_dir = working_dir.replace("/", "\\")

    # LinkFlags:
    # 0x02 = HasLinkInfo
    # 0x08 = HasRelativePath
    # 0x10 = HasWorkingDir
    # 0x80 = IsUnicode
    flags = 0x02 | 0x10 | 0x80
    if description:
        flags |= 0x04 # HasName

    # Header (76 bytes)
    header = bytearray(76)
    struct.pack_into("<I", header, 0, 76) # HeaderSize
    # CLSID: 00021401-0000-0000-C000-000000000046
    clsid = bytes.fromhex("0114020000000000c000000000000046")
    header[4:20] = clsid
    struct.pack_into("<I", header, 20, flags) # LinkFlags
    struct.pack_into("<I", header, 24, 0x20) # FileAttributes (FILE_ATTRIBUTE_ARCHIVE)
    struct.pack_into("<I", header, 56, 0) # IconIndex
    struct.pack_into("<I", header, 60, 1) # ShowCommand (SW_SHOWNORMAL)

    # LinkInfo
    # VolumeID structure
    vol_drive_type = 3 # DRIVE_FIXED
    vol_serial = 0x12345678
    vol_label = b""
    vol_id_header_size = 16
    vol_id_len = vol_id_header_size + len(vol_label) + 1
    vol_id = bytearray(vol_id_len)
    struct.pack_into("<I", vol_id, 0, vol_id_len)
    struct.pack_into("<I", vol_id, 4, vol_drive_type)
    struct.pack_into("<I", vol_id, 8, vol_serial)
    struct.pack_into("<I", vol_id, 12, vol_id_header_size)
    vol_id[16:] = vol_label + b"\x00"

    target_bytes = target_path.encode("ascii", errors="ignore") + b"\x00"
    common_suffix = b"\x00"

    link_info_header_size = 28
    vol_id_offset = link_info_header_size
    local_base_path_offset = vol_id_offset + len(vol_id)
    common_network_offset = 0
    common_path_suffix_offset = local_base_path_offset + len(target_bytes)

    link_info_size = common_path_suffix_offset + len(common_suffix)

    link_info = bytearray(link_info_size)
    struct.pack_into("<I", link_info, 0, link_info_size)
    struct.pack_into("<I", link_info, 4, link_info_header_size)
    struct.pack_into("<I", link_info, 8, 1) # Flags: VolumeIDAndLocalBasePath
    struct.pack_into("<I", link_info, 12, vol_id_offset)
    struct.pack_into("<I", link_info, 16, local_base_path_offset)
    struct.pack_into("<I", link_info, 20, common_network_offset)
    struct.pack_into("<I", link_info, 24, common_path_suffix_offset)

    link_info[vol_id_offset:vol_id_offset+len(vol_id)] = vol_id
    link_info[local_base_path_offset:local_base_path_offset+len(target_bytes)] = target_bytes
    link_info[common_path_suffix_offset:common_path_suffix_offset+len(common_suffix)] = common_suffix

    # StringData structures (Unicode when IsUnicode flag is set)
    string_data = bytearray()
    if description:
        desc_utf16 = description.encode("utf-16le")
        string_data += struct.pack("<H", len(description)) + desc_utf16

    workdir_utf16 = working_dir.encode("utf-16le")
    string_data += struct.pack("<H", len(working_dir)) + workdir_utf16

    os.makedirs(os.path.dirname(os.path.abspath(lnk_path)), exist_ok=True)
    with open(lnk_path, "wb") as f:
        f.write(header)
        f.write(link_info)
        f.write(string_data)

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python create_shortcut.py <target_exe_windows_path> <output_lnk_path> [working_dir] [description]")
        sys.exit(1)
    target = sys.argv[1]
    lnk = sys.argv[2]
    workdir = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    desc = sys.argv[4] if len(sys.argv) > 4 else "Plugman VST Manager"
    create_shortcut(target, lnk, workdir, desc)
    print(f"Created shortcut: {lnk} -> {target}")
