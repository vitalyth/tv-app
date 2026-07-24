import { api } from "@/lib/api";

type ImageSize = {
    width: number;
    height: number;
};

const GRID_IMAGE_SIZE: ImageSize = { width: 96, height: 54 };
const DETAIL_IMAGE_SIZE: ImageSize = { width: 1280, height: 720 };
const POSTER_IMAGE_SIZE: ImageSize = { width: 870, height: 708 };
const GRID_IMAGE_QUALITY = 50;
const DETAIL_IMAGE_QUALITY = 85;
const DETAIL_IMAGE_PROXY_HOSTS = new Set([
    "kan.org.il",
    "mobapi.kan.org.il",
    "www.kan.org.il",
]);
const PROGRAM_GUIDE_IMAGE_PROXY_HOSTS = new Set([
    "cdn.i24news.tv",
    "images.maariv.co.il",
    "img.mako.co.il",
    "insight-images-do.immergo.tv",
    "kan.org.il",
    "media3.reshet.tv",
    "mobapi.kan.org.il",
    "r.il.cdn-redge.media",
    "www.9tv.co.il",
    "www.c14.co.il",
    "www.kan.org.il",
    "www.knesset.tv",
]);
const GRID_PROXY_RESIZE_HOSTS = new Set([
    "cdn.i24news.tv",
    "images.maariv.co.il",
    "img.mako.co.il",
    "insight-images-do.immergo.tv",
    "www.knesset.tv",
    "www.9tv.co.il",
]);

export function resolveImageSrc(image?: string | null): string {
    if (!image) return "";

    const trimmed = image.trim();
    if (!trimmed) return "";

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return trimmed;
    }

    if (trimmed.startsWith("//")) {
        return `https:${trimmed}`;
    }

    if (trimmed.startsWith("/")) {
        return trimmed;
    }

    return `/ch/${trimmed}`;
}

function resizeKalturaImage(url: URL, size: ImageSize, quality = DETAIL_IMAGE_QUALITY): string {
    const path = url.pathname;
    const hasQuality = /\/quality\/\d+/i.test(path);

    if (path.includes("/width/")) {
        url.pathname = path
            .replace(/\/width\/\d+/i, `/width/${size.width}`)
            .replace(/\/height\/\d+/i, `/height/${size.height}`)
            .replace(/\/quality\/\d+/i, `/quality/${quality}`);
        if (!hasQuality) {
            url.pathname = `${url.pathname.replace(/\/$/, "")}/quality/${quality}`;
        }
        return url.toString();
    }

    url.pathname = `${path.replace(/\/$/, "")}/width/${size.width}/height/${size.height}/quality/${quality}`;
    return url.toString();
}

function resizePathWidthUrl(url: URL, size: ImageSize, quality = DETAIL_IMAGE_QUALITY): string {
    url.pathname = url.pathname.replace(/(?:^|,)w_\d+(?=,|$|\/)/, (match) => {
        const prefix = match.startsWith(",") ? "," : "";
        return `${prefix}w_${size.width}`;
    });

    if (/(?:^|,)q_\d+(?=,|$|\/)/.test(url.pathname)) {
        url.pathname = url.pathname.replace(/(?:^|,)q_\d+(?=,|$|\/)/, (match) => {
            const prefix = match.startsWith(",") ? "," : "";
            return `${prefix}q_${quality}`;
        });
    }

    return url.toString();
}

function resizeCloudinaryUrl(url: URL, size: ImageSize, quality = DETAIL_IMAGE_QUALITY): string {
    const uploadMarker = "/image/upload/";
    if (!url.pathname.includes(uploadMarker)) return "";

    const [prefix, suffix] = url.pathname.split(uploadMarker);
    const parts = suffix.split("/");
    const versionIndex = parts.findIndex((part) => /^v\d+$/.test(part));
    const rest = versionIndex >= 0 ? parts.slice(versionIndex).join("/") : parts.slice(1).join("/");

    if (!rest) return "";

    url.pathname = `${prefix}${uploadMarker}c_fill,g_auto,w_${size.width},h_${size.height},q_${quality},f_auto/${rest}`;
    return url.toString();
}

function resizeQueryImage(url: URL, size: ImageSize, quality = DETAIL_IMAGE_QUALITY): string {
    const params = url.searchParams;

    if (params.has("width")) params.set("width", String(size.width));
    if (params.has("height")) params.set("height", String(size.height));
    if (params.has("w")) params.set("w", String(size.width));
    if (params.has("h")) params.set("h", String(size.height));
    if (params.has("quality")) params.set("quality", String(quality));
    if (params.has("q")) params.set("q", String(quality));

    return url.toString();
}

export function getSizedImageSrc(image?: string | null, size: ImageSize = DETAIL_IMAGE_SIZE, quality = DETAIL_IMAGE_QUALITY): string {
    const src = resolveImageSrc(image);
    if (!src || src.startsWith("/")) return src;

    try {
        const url = new URL(src);
        const host = url.hostname.toLowerCase();

        if (host.includes("images.frp1.ott.kaltura.com")) {
            return resizeKalturaImage(url, size, quality);
        }

        if (url.searchParams.has("width") || url.searchParams.has("height") || url.searchParams.has("w") || url.searchParams.has("h")) {
            return resizeQueryImage(url, size, quality);
        }

        if (/[,/]w_\d+(?=,|$|\/)/.test(url.pathname)) {
            return resizePathWidthUrl(url, size, quality);
        }

        return url.toString();
    } catch {
        return src;
    }
}

function isImageProxyHost(src: string, hosts: Set<string>): boolean {
    if (!src || src.startsWith("/")) return false;
    try {
        return hosts.has(new URL(src).hostname.toLowerCase());
    } catch {
        return false;
    }
}

function getImageProxySrc(src: string, params = ""): string {
    return api(`/image_proxy?url=${encodeURIComponent(src)}${params}`);
}

function getDirectSmallImageSrc(src: string): string {
    if (!src || src.startsWith("/")) return "";

    try {
        const url = new URL(src);
        const host = url.hostname.toLowerCase();

        if (DETAIL_IMAGE_PROXY_HOSTS.has(host)) {
            return url.toString();
        }

        if (host.includes("images.frp1.ott.kaltura.com")) {
            return resizeKalturaImage(url, GRID_IMAGE_SIZE, GRID_IMAGE_QUALITY);
        }

        if (host === "media3.reshet.tv") {
            return resizeCloudinaryUrl(url, GRID_IMAGE_SIZE, GRID_IMAGE_QUALITY);
        }

        if (host === "www.c14.co.il") {
            return url.toString();
        }

        if (url.searchParams.has("width") || url.searchParams.has("height") || url.searchParams.has("w") || url.searchParams.has("h")) {
            return resizeQueryImage(url, GRID_IMAGE_SIZE, GRID_IMAGE_QUALITY);
        }

        if (/[,/]w_\d+(?=,|$|\/)/.test(url.pathname)) {
            return resizePathWidthUrl(url, GRID_IMAGE_SIZE, GRID_IMAGE_QUALITY);
        }

        return "";
    } catch {
        return "";
    }
}

export function getGridImageSrc(image?: string | null): string {
    return getSizedImageSrc(image, GRID_IMAGE_SIZE, GRID_IMAGE_QUALITY);
}

export function getProgramGuideImageSrc(image?: string | null): string {
    const src = resolveImageSrc(image);
    if (!isImageProxyHost(src, PROGRAM_GUIDE_IMAGE_PROXY_HOSTS)) return "";

    const directSmallSrc = getDirectSmallImageSrc(src);
    if (directSmallSrc) {
        return isImageProxyHost(directSmallSrc, DETAIL_IMAGE_PROXY_HOSTS)
            ? getImageProxySrc(directSmallSrc)
            : directSmallSrc;
    }

    if (!isImageProxyHost(src, GRID_PROXY_RESIZE_HOSTS)) return "";

    return getImageProxySrc(src, `&width=${GRID_IMAGE_SIZE.width}&height=${GRID_IMAGE_SIZE.height}&quality=${GRID_IMAGE_QUALITY}`);
}

export function getDetailImageSrc(image?: string | null): string {
    const resolved = resolveImageSrc(image);
    if (isImageProxyHost(resolved, DETAIL_IMAGE_PROXY_HOSTS)) {
        return getImageProxySrc(resolved);
    }

    return getSizedImageSrc(image, DETAIL_IMAGE_SIZE);
}

export function getPosterImageSrc(image?: string | null): string {
    return getSizedImageSrc(image, POSTER_IMAGE_SIZE);
}
