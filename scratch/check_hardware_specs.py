import shutil, psutil, os

total, used, free = shutil.disk_usage("C:\\")
print(f"Total disk: {total / (1024**3):.2f} GB")
print(f"Used disk:  {used / (1024**3):.2f} GB")
print(f"Free disk:  {free / (1024**3):.2f} GB")

ram = psutil.virtual_memory()
print(f"Total RAM:  {ram.total / (1024**3):.2f} GB")
print(f"Free RAM:   {ram.available / (1024**3):.2f} GB")
