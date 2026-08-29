#!/usr/bin/env python3
"""Fit sender functions from sender_raw_points.csv.

Pinned dependencies:
  numpy==2.1.3
  scipy==1.14.1

The script never hardcodes a fitted result. It only uses rows marked fit_eligible=true.
A group must contain at least three distinct finite input values. By default it writes
sender_function_parameters_refit.csv so the curated reported-parameter file is not overwritten.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import curve_fit


def as_float(value):
    if value is None or value == "":
        return None
    try:
        x = float(value)
    except ValueError:
        return None
    return x if math.isfinite(x) else None


def linear(x, a, b):
    return a * x + b


def log_linear(x, a, b):
    return a * np.log10(x) + b


def hill(x, ymin, ymax, k, n):
    return ymin + (ymax - ymin) * np.power(x, n) / (np.power(k, n) + np.power(x, n))


def logistic(x, ymin, ymax, x0, k):
    return ymin + (ymax - ymin) / (1.0 + np.exp(-k * (x - x0)))


def metrics(y, pred):
    residual = y - pred
    ss_res = float(np.sum(residual ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r2 = None if ss_tot == 0 else 1.0 - ss_res / ss_tot
    rmse = float(np.sqrt(np.mean(residual ** 2)))
    return r2, rmse


def fit_group(x, y, model_name):
    if model_name == "linear":
        p, _ = curve_fit(linear, x, y)
        pred = linear(x, *p)
        return "y=a*x+b", {"a": p[0], "b": p[1]}, pred
    if model_name == "log_linear":
        if np.any(x <= 0):
            raise ValueError("log_linear requires all inputs > 0")
        p, _ = curve_fit(log_linear, x, y)
        pred = log_linear(x, *p)
        return "y=a*log10(x)+b", {"a": p[0], "b": p[1]}, pred
    if model_name == "hill":
        guess = [float(np.min(y)), float(np.max(y)), float(np.median(x[x > 0])), 1.0]
        bounds = ([-np.inf, -np.inf, np.finfo(float).eps, 0.01], [np.inf, np.inf, np.inf, 10.0])
        p, _ = curve_fit(hill, x, y, p0=guess, bounds=bounds, maxfev=200000)
        pred = hill(x, *p)
        return "y=ymin+(ymax-ymin)*x^n/(K^n+x^n)", dict(zip(["ymin","ymax","K","n"], p)), pred
    if model_name == "logistic":
        guess = [float(np.min(y)), float(np.max(y)), float(np.median(x)), 1.0]
        p, _ = curve_fit(logistic, x, y, p0=guess, maxfev=200000)
        pred = logistic(x, *p)
        return "y=ymin+(ymax-ymin)/(1+exp(-k*(x-x0)))", dict(zip(["ymin","ymax","x0","k"], p)), pred
    if model_name == "lookup_table":
        order = np.argsort(x)
        table = [{"input": float(x[i]), "output": float(y[i])} for i in order]
        return "piecewise linear interpolation within observed range", {"table": table}, y.copy()
    raise ValueError(f"Unsupported model: {model_name}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="sender_raw_points.csv")
    ap.add_argument("--output", default="sender_function_parameters_refit.csv")
    ap.add_argument("--model", choices=["linear","log_linear","hill","logistic","lookup_table"], default="lookup_table")
    args = ap.parse_args()

    groups = defaultdict(list)
    with open(args.input, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row.get("fit_eligible", "").lower() != "true":
                continue
            x, y = as_float(row.get("input_value")), as_float(row.get("output_value"))
            if x is None or y is None:
                continue
            groups[row["sender_output_id"]].append((x, y, row))

    fields = ["sender_output_id","model_type","formula","parameter_json","valid_input_min","valid_input_max",
              "valid_output_min","valid_output_max","fit_method","reported_or_refit","r_squared","rmse",
              "data_point_count","source_ids","evidence_locations","runtime_allowed","notes"]
    out_rows = []
    for output_id, items in sorted(groups.items()):
        x = np.array([i[0] for i in items], dtype=float)
        y = np.array([i[1] for i in items], dtype=float)
        if len(np.unique(x)) < 3:
            continue
        formula, params, pred = fit_group(x, y, args.model)
        r2, rmse = metrics(y, pred)
        out_rows.append({
            "sender_output_id": output_id, "model_type": args.model, "formula": formula,
            "parameter_json": json.dumps(params, ensure_ascii=False),
            "valid_input_min": float(np.min(x)), "valid_input_max": float(np.max(x)),
            "valid_output_min": float(np.min(y)), "valid_output_max": float(np.max(y)),
            "fit_method": f"scipy.optimize.curve_fit ({args.model})" if args.model != "lookup_table" else "observed-point lookup with linear interpolation",
            "reported_or_refit": "refit", "r_squared": r2, "rmse": rmse, "data_point_count": len(x),
            "source_ids": ";".join(sorted({i[2]["source_id"] for i in items})),
            "evidence_locations": ";".join(sorted({i[2]["evidence_location"] for i in items})),
            "runtime_allowed": "false",
            "notes": "Runtime remains false until independent admission validation confirms all context, identity, uncertainty and range requirements."
        })

    with open(args.output, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(out_rows)
    print(f"Wrote {len(out_rows)} fitted group(s) to {args.output}")


if __name__ == "__main__":
    main()
