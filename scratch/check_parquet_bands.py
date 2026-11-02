import pandas as pd
import io
from PIL import Image

df = pd.read_parquet(r"C:\Users\shash\Downloads\osiris-master\osiris-master\.cache\oscd\train_rgb.parquet")
print("Columns in train_rgb.parquet:", df.columns.tolist())
row = df.iloc[0]
img1 = Image.open(io.BytesIO(row['image1']['bytes']))
print(f"Image 1 format: {img1.format}, mode: {img1.mode}, size: {img1.size}, bands: {img1.getbands()}")
