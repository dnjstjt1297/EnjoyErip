#!/usr/bin/env python3
"""Build EnjoyTrip's original, dependency-free low-poly glTF 2.0 airplane.

The generated asset is authored here; no downloaded models or textures are used.
Coordinates: +X nose, +Y up, Z wings. Run from any working directory.
"""
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/models/airplane.glb"
TAU = math.tau
parts = []
materials = [
    {"name": "Porcelain fuselage", "pbrMetallicRoughness": {"baseColorFactor": [.89, .94, .97, 1], "metallicFactor": .08, "roughnessFactor": .28}},
    {"name": "EnjoyTrip blue", "pbrMetallicRoughness": {"baseColorFactor": [.025, .16, .72, 1], "metallicFactor": .18, "roughnessFactor": .30}},
    {"name": "Smoked cockpit glass", "pbrMetallicRoughness": {"baseColorFactor": [.014, .040, .062, 1], "metallicFactor": .30, "roughnessFactor": .15}},
    {"name": "Turbine interior", "pbrMetallicRoughness": {"baseColorFactor": [.027, .037, .05, 1], "metallicFactor": .65, "roughnessFactor": .43}},
    {"name": "Brushed turbine rim", "pbrMetallicRoughness": {"baseColorFactor": [.42, .51, .56, 1], "metallicFactor": .8, "roughnessFactor": .24}},
]


def mesh(name, points, triangles, material=0):
    normals = [[0., 0., 0.] for _ in points]
    for a, b, c in triangles:
        ab = [points[b][i] - points[a][i] for i in range(3)]
        ac = [points[c][i] - points[a][i] for i in range(3)]
        n = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]]
        for vertex in (a, b, c):
            normals[vertex] = [normals[vertex][i] + n[i] for i in range(3)]
    for i, n in enumerate(normals):
        length = math.sqrt(sum(v*v for v in n)) or 1
        normals[i] = [v / length for v in n]
    parts.append((name, points, normals, [v for tri in triangles for v in tri], material))


def lathe(name, rings, material=0, center=(0, 0), scale_y=1, sides=40, caps=True):
    points = [(x, center[0]+r*math.cos(TAU*j/sides)*scale_y, center[1]+r*math.sin(TAU*j/sides)) for x, r in rings for j in range(sides)]
    triangles = []
    for i in range(len(rings)-1):
        for j in range(sides):
            k = (j+1) % sides
            a, b, c, d = i*sides+j, (i+1)*sides+j, (i+1)*sides+k, i*sides+k
            triangles.extend([(a, c, b), (a, d, c)])
    if caps:
        for ring, reverse in [(0, True), (len(rings)-1, False)]:
            ci = len(points)
            points.append((rings[ring][0], center[0], center[1]))
            for j in range(sides):
                a, b = ring*sides+j, ring*sides+(j+1) % sides
                triangles.append((ci, b, a) if reverse else (ci, a, b))
    mesh(name, points, triangles, material)


profile = [(-3.5, .035), (-3.36, .085), (-3.1, .17), (-2.7, .29), (-2.2, .39), (-1.6, .45), (-.8, .48), (.2, .48), (1.5, .47)]
for i in range(1, 15):
    theta = (math.pi/2)*(1-i/15)
    profile.append((1.5+1.6*math.cos(theta), .47*math.sin(theta)))
profile.append((3.1, .005))
lathe("fuselage", profile, scale_y=.94, sides=48)


def radius(x):
    for (x0, r0), (x1, r1) in zip(profile, profile[1:]):
        if x0 <= x <= x1:
            return r0 + (r1-r0)*(x-x0)/(x1-x0)
    return .01


def wing(name, sections, sign=1):
    samples = [(0, 0), (.055, .52), (.16, .87), (.35, 1), (.65, .8), (.88, .38), (1, 0), (.88, -.22), (.65, -.4), (.35, -.5), (.16, -.43), (.055, -.26)]
    points = []
    for z, lead, trail, y, thick in sections:
        points.extend((lead+(trail-lead)*u, y+v*thick, sign*z) for u, v in samples)
    n = len(samples)
    tris = []
    for i in range(len(sections)-1):
        for j in range(n):
            a, b, c, d = i*n+j, (i+1)*n+j, (i+1)*n+(j+1)%n, i*n+(j+1)%n
            tris.extend([(a, c, b), (a, d, c)] if sign == 1 else [(a, b, c), (a, c, d)])
    for j in range(1, n-1):
        offset = (len(sections)-1)*n
        tris.extend([(0, j+1, j), (offset, offset+j, offset+j+1)] if sign == 1 else [(0, j, j+1), (offset, offset+j+1, offset+j)])
    mesh(name, points, tris, 1)


for sign, side in [(1, "left"), (-1, "right")]:
    wing(f"wing-{side}", [(.34, .65, -1.45, -.07, .13), (1.15, .22, -1.55, -.025, .11), (2.65, -.98, -2.0, .12, .075), (3.55, -1.9, -2.42, .28, .028)], sign)
    wing(f"winglet-{side}", [(3.5, -1.88, -2.42, .26, .035), (3.64, -2.02, -2.48, .65, .02), (3.69, -2.22, -2.48, .89, .009)], sign)
    wing(f"tailplane-{side}", [(.15, -2.13, -3.25, .28, .075), (.9, -2.8, -3.54, .42, .04), (1.43, -3.3, -3.68, .5, .012)], sign)
    # Engine nacelle and inset fan opening; front faces point toward +X.
    center = (-.59, sign*1.15)
    lathe(f"engine-{side}", [(-.93, .18), (-.81, .225), (-.54, .27), (.28, .28), (.52, .266), (.66, .233)], center=center, sides=36, caps=False)
    lathe(f"engine-rim-{side}", [(.615, .237), (.67, .231), (.692, .21), (.666, .19), (.61, .186)], 4, center, sides=36, caps=False)
    lathe(f"engine-intake-{side}", [(.565, .187), (.575, .187)], 3, center, sides=36)
    lathe(f"engine-spinner-{side}", [(.58, .071), (.66, .059), (.745, .003)], 4, center, sides=24)
    # A broad pylon makes each engine visually attached to its wing.
    wing(f"engine-pylon-{side}", [(1.12, .15, -.72, -.40, .18), (1.20, .15, -.72, -.40, .18)], sign)

# Vertical tail is a thin rounded longitudinal foil lofted upward.
fin_sections = [(.26, -2.22, -3.40, .095), (.65, -2.56, -3.50, .085), (1.43, -3.06, -3.59, .052), (1.67, -3.23, -3.59, .015)]
points = []
perimeter = [(0, 0), (.10, .8), (.35, 1), (.75, .7), (1, 0), (.75, -.7), (.35, -1), (.10, -.8)]
for y, front, back, width in fin_sections:
    points.extend((front+(back-front)*u, y, z*width) for u, z in perimeter)
tris = []
for i in range(len(fin_sections)-1):
    for j in range(8):
        a, b, c, d = i*8+j, (i+1)*8+j, (i+1)*8+(j+1)%8, i*8+(j+1)%8
        tris.extend([(a, b, c), (a, c, d)])
mesh("tail-fin", points, tris, 1)

# Windows lie on the curved fuselage, not on a flat billboard.
def glass_patch(name, x0, x1, theta0, theta1, sign):
    points = []
    for i in range(5):
        x = x0+(x1-x0)*i/4
        r = radius(x)*1.014
        for j in range(5):
            theta = theta0+(theta1-theta0)*j/4
            points.append((x, r*.94*math.cos(theta), sign*r*math.sin(theta)))
    tris = []
    for i in range(4):
        for j in range(4):
            a = i*5+j
            tris.extend([(a, a+6, a+5), (a, a+1, a+6)] if sign == 1 else [(a, a+5, a+6), (a, a+6, a+1)])
    mesh(name, points, tris, 2)

for sign, side in [(1, "left"), (-1, "right")]:
    for i in range(14):
        x = -2.18+i*.265
        glass_patch(f"window-{side}-{i+1:02}", x-.052, x+.052, 1.0, 1.29, sign)
    glass_patch(f"cockpit-front-{side}", 2.25, 2.66, .19, .69, sign)
    glass_patch(f"cockpit-side-{side}", 2.07, 2.48, .76, 1.19, sign)

binary = bytearray()
views, accessors, meshes = [], [], []


def accessor(values, component_type, value_type, target, bounds=None):
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    flat = [x for v in values for x in v] if value_type == "VEC3" else values
    binary.extend(struct.pack("<" + ("f" if component_type == 5126 else "H")*len(flat), *flat))
    views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(binary)-offset, "target": target})
    item = {"bufferView": len(views)-1, "componentType": component_type, "count": len(values), "type": value_type}
    if bounds:
        item.update(bounds)
    accessors.append(item)
    return len(accessors)-1


for name, points, normals, indices, material in parts:
    p = accessor(points, 5126, "VEC3", 34962, {"min": [min(v[i] for v in points) for i in range(3)], "max": [max(v[i] for v in points) for i in range(3)]})
    n = accessor(normals, 5126, "VEC3", 34962)
    ix = accessor(indices, 5123, "SCALAR", 34963)
    meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": p, "NORMAL": n}, "indices": ix, "material": material}]})

document = {"asset": {"version": "2.0", "generator": "EnjoyTrip original airplane / tools/build-airplane-model.py", "copyright": "EnjoyTrip contributors"}, "scene": 0, "scenes": [{"nodes": list(range(len(meshes)))}], "nodes": [{"name": m["name"], "mesh": i} for i, m in enumerate(meshes)], "meshes": meshes, "materials": materials, "buffers": [{"byteLength": len(binary)}], "bufferViews": views, "accessors": accessors}
encoded = json.dumps(document, ensure_ascii=True, separators=(",", ":")).encode()
encoded += b" "*((-len(encoded)) % 4)
binary += b"\x00"*((-len(binary)) % 4)
total = 12 + 8 + len(encoded) + 8 + len(binary)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_bytes(struct.pack("<III", 0x46546C67, 2, total)+struct.pack("<II", len(encoded), 0x4E4F534A)+encoded+struct.pack("<II", len(binary), 0x004E4942)+binary)
print(f"Created {OUT.relative_to(ROOT)}: {len(meshes)} meshes, {sum(len(p[1]) for p in parts)} vertices, {total:,} bytes")
