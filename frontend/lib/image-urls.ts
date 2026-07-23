type ImageSize = {
    width: number;
    height: number;
};

const GRID_IMAGE_SIZE: ImageSize = { width: 288, height: 162 };
const DETAIL_IMAGE_SIZE: ImageSize = { width: 1280, height: 720 };
const POSTER_IMAGE_SIZE: ImageSize = { width: 870, height: 708 };
const KALTURA_IMAGE_QUALITY = 85;

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

function resizeKalturaImage(url: URL, size: ImageSize): string {
    const path = url.pathname;
    const hasQuality = /\/quality\/\d+/i.test(path);

    if (path.includes("/width/")) {
        url.pathname = path
            .replace(/\/width\/\d+/i, `/width/${size.width}`)
            .replace(/\/height\/\d+/i, `/height/${size.height}`)
            .replace(/\/quality\/\d+/i, `/quality/${KALTURA_IMAGE_QUALITY}`);
        if (!hasQuality) {
            url.pathname = `${url.pathname.replace(/\/$/, "")}/quality/${KALTURA_IMAGE_QUALITY}`;
        }
        return url.toString();
    }

    url.pathname = `${path.replace(/\/$/, "")}/width/${size.width}/height/${size.height}/quality/${KALTURA_IMAGE_QUALITY}`;
    return url.toString();
}

function resizePathWidthUrl(url: URL, size: ImageSize): string {
    url.pathname = url.pathname.replace(/(?:^|,)w_\d+(?=,|$|\/)/, (match) => {
        const prefix = match.startsWith(",") ? "," : "";
        return `${prefix}w_${size.width}`;
    });
    return url.toString();
}

function resizeQueryImage(url: URL, size: ImageSize): string {
    const params = url.searchParams;

    if (params.has("width")) params.set("width", String(size.width));
    if (params.has("height")) params.set("height", String(size.height));
    if (params.has("w")) params.set("w", String(size.width));
    if (params.has("h")) params.set("h", String(size.height));

    return url.toString();
}

export function getSizedImageSrc(image?: string | null, size: ImageSize = DETAIL_IMAGE_SIZE): string {
    const src = resolveImageSrc(image);
    if (!src || src.startsWith("/")) return src;

    try {
        const url = new URL(src);
        const host = url.hostname.toLowerCase();

        if (host.includes("images.frp1.ott.kaltura.com")) {
            return resizeKalturaImage(url, size);
        }

        if (url.searchParams.has("width") || url.searchParams.has("height") || url.searchParams.has("w") || url.searchParams.has("h")) {
            return resizeQueryImage(url, size);
        }

        if (/[,/]w_\d+(?=,|$|\/)/.test(url.pathname)) {
            return resizePathWidthUrl(url, size);
        }

        return url.toString();
    } catch {
        return src;
    }
}

export function getGridImageSrc(image?: string | null): string {
    return getSizedImageSrc(image, GRID_IMAGE_SIZE);
}

export function getDetailImageSrc(image?: string | null): string {
    return getSizedImageSrc(image, DETAIL_IMAGE_SIZE);
}

export function getPosterImageSrc(image?: string | null): string {
    return getSizedImageSrc(image, POSTER_IMAGE_SIZE);
}
