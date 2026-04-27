package at.oxs.paw.network

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object RetrofitClient {
    private var baseUrl: String = "http://10.0.2.2:3000/api/"  // Android Emulator → localhost
    private var token: String? = null
    private var apiService: ApiService? = null

    private fun buildClient() = OkHttpClient.Builder()
        .addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BODY })
        .addInterceptor { chain ->
            val req = chain.request().newBuilder()
                .apply { token?.let { addHeader("Authorization", "Bearer $it") } }
                .build()
            chain.proceed(req)
        }
        .build()

    fun build(url: String = baseUrl, jwt: String? = null): ApiService {
        baseUrl = url
        token = jwt
        apiService = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(buildClient())
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
        return apiService!!
    }

    fun getApiService(): ApiService? = apiService
}
