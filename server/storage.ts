import {
  type Company,
  type InsertCompany,
  type Location,
  type InsertLocation,
  type Light,
  type InsertLight,
  type UpdateLight,
  type Tv,
  type InsertTv,
  type UpdateTv,
  type Video,
  type InsertVideo,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { legacyCompanies, lights, locations, tvs, videos } from "./db/schema";

export interface IStorage {
  // legacyCompanies
  getAllCompanies(): Promise<Company[]>;
  getCompany(id: string): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  deleteCompany(id: string): Promise<boolean>;

  // Locations
  getAllLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  getLocationsByCompany(companyId: string): Promise<Location[]>;
  createLocation(location: InsertLocation): Promise<Location>;
  deleteLocation(id: string): Promise<boolean>;

  // Lights
  getAllLights(): Promise<Light[]>;
  getLight(id: string): Promise<Light | undefined>;
  getLightsByLocation(locationId: string): Promise<Light[]>;
  createLight(light: InsertLight): Promise<Light>;
  updateLight(id: string, updates: UpdateLight): Promise<Light | undefined>;
  deleteLight(id: string): Promise<boolean>;

  // TVs
  getAllTvs(): Promise<Tv[]>;
  getTv(id: string): Promise<Tv | undefined>;
  getTvsByLocation(locationId: string): Promise<Tv[]>;
  createTv(tv: InsertTv): Promise<Tv>;
  updateTv(id: string, updates: UpdateTv): Promise<Tv | undefined>;
  deleteTv(id: string): Promise<boolean>;

  // Videos
  getAllVideos(): Promise<Video[]>;
  getVideo(id: string): Promise<Video | undefined>;
  createVideo(video: InsertVideo): Promise<Video>;
  deleteVideo(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private legacyCompanies: Map<string, Company>;
  private locations: Map<string, Location>;
  private lights: Map<string, Light>;
  private tvs: Map<string, Tv>;
  private videos: Map<string, Video>;

  constructor() {
    this.legacyCompanies = new Map();
    this.locations = new Map();
    this.lights = new Map();
    this.tvs = new Map();
    this.videos = new Map();
  }

  // legacyCompanies
  async getAllCompanies(): Promise<Company[]> {
    return Array.from(this.legacyCompanies.values());
  }

  async getCompany(id: string): Promise<Company | undefined> {
    return this.legacyCompanies.get(id);
  }

  async createCompany(insertCompany: InsertCompany): Promise<Company> {
    const id = randomUUID();
    const company: Company = { ...insertCompany, id };
    this.legacyCompanies.set(id, company);
    return company;
  }

  async deleteCompany(id: string): Promise<boolean> {
    return this.legacyCompanies.delete(id);
  }

  // Locations
  async getAllLocations(): Promise<Location[]> {
    return Array.from(this.locations.values());
  }

  async getLocation(id: string): Promise<Location | undefined> {
    return this.locations.get(id);
  }

  async getLocationsByCompany(companyId: string): Promise<Location[]> {
    return Array.from(this.locations.values()).filter(
      (loc) => loc.companyId === companyId
    );
  }

  async createLocation(insertLocation: InsertLocation): Promise<Location> {
    const id = randomUUID();
    const location: Location = { ...insertLocation, id };
    this.locations.set(id, location);
    return location;
  }

  async deleteLocation(id: string): Promise<boolean> {
    return this.locations.delete(id);
  }

  // Lights
  async getAllLights(): Promise<Light[]> {
    return Array.from(this.lights.values());
  }

  async getLight(id: string): Promise<Light | undefined> {
    return this.lights.get(id);
  }

  async getLightsByLocation(locationId: string): Promise<Light[]> {
    return Array.from(this.lights.values()).filter(
      (light) => light.locationId === locationId
    );
  }

  async createLight(insertLight: InsertLight): Promise<Light> {
    const id = randomUUID();
    const light: Light = { ...insertLight, id };
    this.lights.set(id, light);
    return light;
  }

  async updateLight(id: string, updates: UpdateLight): Promise<Light | undefined> {
    const light = this.lights.get(id);
    if (!light) return undefined;

    const updatedLight = { ...light, ...updates };
    this.lights.set(id, updatedLight);
    return updatedLight;
  }

  async deleteLight(id: string): Promise<boolean> {
    return this.lights.delete(id);
  }

  // TVs
  async getAllTvs(): Promise<Tv[]> {
    return Array.from(this.tvs.values());
  }

  async getTv(id: string): Promise<Tv | undefined> {
    return this.tvs.get(id);
  }

  async getTvsByLocation(locationId: string): Promise<Tv[]> {
    return Array.from(this.tvs.values()).filter(
      (tv) => tv.locationId === locationId
    );
  }

  async createTv(insertTv: InsertTv): Promise<Tv> {
    const id = randomUUID();
    const tv: Tv = { ...insertTv, id };
    this.tvs.set(id, tv);
    return tv;
  }

  async updateTv(id: string, updates: UpdateTv): Promise<Tv | undefined> {
    const tv = this.tvs.get(id);
    if (!tv) return undefined;

    const updatedTv = { ...tv, ...updates };
    this.tvs.set(id, updatedTv);
    return updatedTv;
  }

  async deleteTv(id: string): Promise<boolean> {
    return this.tvs.delete(id);
  }

  // Videos
  async getAllVideos(): Promise<Video[]> {
    return Array.from(this.videos.values());
  }

  async getVideo(id: string): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const id = randomUUID();
    const video: Video = {
      ...insertVideo,
      id,
      uploadedAt: new Date(),
    };
    this.videos.set(id, video);
    return video;
  }

  async deleteVideo(id: string): Promise<boolean> {
    return this.videos.delete(id);
  }
}

export class PostgresStorage implements IStorage {
  private db = getDb();

  // legacyCompanies
  async getAllCompanies(): Promise<Company[]> {
    return await this.db.select().from(legacyCompanies);
  }

  async getCompany(id: string): Promise<Company | undefined> {
    const rows = await this.db.select().from(legacyCompanies).where(eq(legacyCompanies.id, id));
    return rows[0];
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const rows = await this.db.insert(legacyCompanies).values(company).returning();
    return rows[0]!;
  }

  async deleteCompany(id: string): Promise<boolean> {
    const rows = await this.db.delete(legacyCompanies).where(eq(legacyCompanies.id, id)).returning({ id: legacyCompanies.id });
    return rows.length > 0;
  }

  // Locations
  async getAllLocations(): Promise<Location[]> {
    return await this.db.select().from(locations);
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const rows = await this.db.select().from(locations).where(eq(locations.id, id));
    return rows[0];
  }

  async getLocationsByCompany(companyId: string): Promise<Location[]> {
    return await this.db.select().from(locations).where(eq(locations.companyId, companyId));
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const rows = await this.db.insert(locations).values(location).returning();
    return rows[0]!;
  }

  async deleteLocation(id: string): Promise<boolean> {
    const rows = await this.db.delete(locations).where(eq(locations.id, id)).returning({ id: locations.id });
    return rows.length > 0;
  }

  // Lights
  async getAllLights(): Promise<Light[]> {
    return await this.db.select().from(lights);
  }

  async getLight(id: string): Promise<Light | undefined> {
    const rows = await this.db.select().from(lights).where(eq(lights.id, id));
    return rows[0];
  }

  async getLightsByLocation(locationId: string): Promise<Light[]> {
    return await this.db.select().from(lights).where(eq(lights.locationId, locationId));
  }

  async createLight(light: InsertLight): Promise<Light> {
    const rows = await this.db.insert(lights).values(light).returning();
    return rows[0]!;
  }

  async updateLight(id: string, updates: UpdateLight): Promise<Light | undefined> {
    const rows = await this.db.update(lights).set(updates).where(eq(lights.id, id)).returning();
    return rows[0];
  }

  async deleteLight(id: string): Promise<boolean> {
    const rows = await this.db.delete(lights).where(eq(lights.id, id)).returning({ id: lights.id });
    return rows.length > 0;
  }

  // TVs
  async getAllTvs(): Promise<Tv[]> {
    return await this.db.select().from(tvs);
  }

  async getTv(id: string): Promise<Tv | undefined> {
    const rows = await this.db.select().from(tvs).where(eq(tvs.id, id));
    return rows[0];
  }

  async getTvsByLocation(locationId: string): Promise<Tv[]> {
    return await this.db.select().from(tvs).where(eq(tvs.locationId, locationId));
  }

  async createTv(tv: InsertTv): Promise<Tv> {
    const rows = await this.db.insert(tvs).values(tv).returning();
    return rows[0]!;
  }

  async updateTv(id: string, updates: UpdateTv): Promise<Tv | undefined> {
    const rows = await this.db.update(tvs).set(updates).where(eq(tvs.id, id)).returning();
    return rows[0];
  }

  async deleteTv(id: string): Promise<boolean> {
    const rows = await this.db.delete(tvs).where(eq(tvs.id, id)).returning({ id: tvs.id });
    return rows.length > 0;
  }

  // Videos
  async getAllVideos(): Promise<Video[]> {
    return await this.db.select().from(videos);
  }

  async getVideo(id: string): Promise<Video | undefined> {
    const rows = await this.db.select().from(videos).where(eq(videos.id, id));
    return rows[0];
  }

  async createVideo(video: InsertVideo): Promise<Video> {
    const rows = await this.db.insert(videos).values(video).returning();
    return rows[0]!;
  }

  async deleteVideo(id: string): Promise<boolean> {
    const rows = await this.db.delete(videos).where(eq(videos.id, id)).returning({ id: videos.id });
    return rows.length > 0;
  }
}

export const storage: IStorage = process.env.DATABASE_URL ? new PostgresStorage() : new MemStorage();
